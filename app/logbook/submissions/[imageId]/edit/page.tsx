'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { SubmissionWorkstation } from '@/components/SubmissionWorkstation'
import { type LightweightCragMapPin } from '@/components/lightweight-crag-map'
import { useRouteStore } from '@/store/routeStore'
import { normalizePoints } from '@/lib/canvasMath'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/hooks/use-atlas-auto-sync'
import { resolveRouteImageUrl } from '@/features/media/utils/route-image-url'
import { createClient } from '@/lib/supabase'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/lib/editor-image-state'
import {
  normalizeSubmissionCreditHandle,
  normalizeSubmissionCreditPlatform,
  type SubmissionCreditPlatform,
} from '@/lib/submission-credit'
import { FACE_DIRECTIONS, type FaceDirection, type ImageSelection, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import type { UnifiedRouteCanvasRef } from '@/components/UnifiedRouteCanvas'
import type { CollaboratorItem, InviteItem } from '@/lib/editor-types'
import { sortFaceDirections, normalizePointForCompare } from '@/lib/editor-helpers'
import { CollaboratorDialog } from '@/components/editor/collaborator-dialog'
import { SubmissionDetailsPanel } from './components/submission-details-panel'
import { SubmissionToolbar } from './components/submission-toolbar'
import { SubmissionLocationPanel } from './components/submission-location-panel'
import { DeleteRouteTransferDialog } from './components/delete-route-transfer-dialog'

interface EditableRoute {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder?: number
}

interface DeleteTransferCandidate {
  routeLineId: string
  climbName: string
  grade: string | null
}

interface ImageRouteLineQuery {
  id: string
  points: RoutePoint[] | string | null
  sequence_order: number
  image_width: number | null
  image_height: number | null
  climbs: {
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
    user_id: string | null
  } | Array<{
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
    user_id: string | null
  }> | null
}

interface EditableImageQuery {
  id: string
  url: string
  submission_id: string | null
  created_by: string | null
  crag_id: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  latitude: number | null
  longitude: number | null
  face_directions: string[] | null
  location_mode?: string | null
  crags?: {
    id: string
    name: string
    region_name: string | null
    sub_area: string | null
  } | Array<{
    id: string
    name: string
    region_name: string | null
    sub_area: string | null
  }> | null
  route_lines: ImageRouteLineQuery[] | null
}

interface SubmissionBatchImageQuery {
  id: string
  submission_id: string | null
  url: string
  latitude: number | null
  longitude: number | null
  face_directions: string[] | null
  is_primary: boolean
  location_mode?: string | null
  face_order?: number | null
}

interface ManageFaceTab {
  imageId: string
  index: number
  label: string
  isPrimary: boolean
  signedUrl: string | null
  latitude?: number | null
  longitude?: number | null
  locationMode?: 'shared' | 'custom'
}

function parsePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  } catch {
    return []
  }
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function parseCoordinate(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

function routeEditSignature(route: EditableRoute): string {
  return JSON.stringify({
    id: route.id,
    name: route.name.trim(),
    description: (route.description || '').trim(),
    sequenceOrder: typeof route.sequenceOrder === 'number' ? route.sequenceOrder : null,
    points: route.points.map((point) => ({
      x: normalizePointForCompare(point.x),
      y: normalizePointForCompare(point.y),
    })),
  })
}

export default function EditSubmittedRoutesPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const routeImageId = params.imageId as string
  const requestedFaceImageId = searchParams.get('face')
  const activeImageId = requestedFaceImageId || routeImageId
  const { toasts, addToast, removeToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [, setSavingEdits] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null)
  const [existingRouteLines, setExistingRouteLines] = useState<RouteLine[]>([])
  const [editedRoutes, setEditedRoutes] = useState<EditableRoute[]>([])
  const [initialEditedRoutes, setInitialEditedRoutes] = useState<EditableRoute[]>([])
  const [canvasKey, setCanvasKey] = useState(0)
  const [latitude, setLatitude] = useState<string>('')
  const [longitude, setLongitude] = useState<string>('')
  const [cragId, setCragId] = useState<string | null>(null)
  const [cragName, setCragName] = useState('')
  const [regionTag, setRegionTag] = useState('')
  const [subArea, setSubArea] = useState('')
  const [faceDirections, setFaceDirections] = useState<FaceDirection[]>([])
  const [initialLatitude, setInitialLatitude] = useState<string>('')
  const [initialLongitude, setInitialLongitude] = useState<string>('')
  const [initialCragName, setInitialCragName] = useState('')
  const [initialRegionTag, setInitialRegionTag] = useState('')
  const [initialSubArea, setInitialSubArea] = useState('')
  const [initialFaceDirections, setInitialFaceDirections] = useState<FaceDirection[]>([])
  const [locationMode, setLocationMode] = useState<'shared' | 'custom'>('custom')
  const [initialLocationMode, setInitialLocationMode] = useState<'shared' | 'custom'>('custom')
  const [shareOpen, setShareOpen] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([])
  const [activeInvites, setActiveInvites] = useState<InviteItem[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [ownerProfile, setOwnerProfile] = useState<{ displayName: string; username: string | null } | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null)
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [isAnonymousSubmission, setIsAnonymousSubmission] = useState(false)
  const [initialIsAnonymousSubmission, setInitialIsAnonymousSubmission] = useState(false)
  const [initialCreditPlatform, setInitialCreditPlatform] = useState<SubmissionCreditPlatform | null>(null)
  const [initialCreditHandle, setInitialCreditHandle] = useState('')
  const [savingAllChanges, setSavingAllChanges] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const parsedLatitude = useMemo(() => parseCoordinate(latitude), [latitude])
  const parsedLongitude = useMemo(() => parseCoordinate(longitude), [longitude])

  const { setRoutes, setMode, setInteractionTool, reset, interactionTool, currentPoints, undoLastPoint, selectedRouteId, setSelectedRoute, setActiveRoute, setEditorPanelOpen } = useRouteStore()
  const atlasSync = useAtlasAutoSync(
    typeof parsedLatitude === 'number' && !Number.isNaN(parsedLatitude) ? parsedLatitude : null,
    typeof parsedLongitude === 'number' && !Number.isNaN(parsedLongitude) ? parsedLongitude : null,
  )
  const [deletingExistingRouteId, setDeletingExistingRouteId] = useState<string | null>(null)
  const [facesLoading, setFacesLoading] = useState(false)
  const [manageFaces, setManageFaces] = useState<ManageFaceTab[]>([])
  const [primaryManageImageId, setPrimaryManageImageId] = useState<string | null>(routeImageId)
  const [deleteTransferSourceRouteLineId, setDeleteTransferSourceRouteLineId] = useState<string | null>(null)
  const [deleteTransferSourceName, setDeleteTransferSourceName] = useState('')
  const [deleteTransferCandidates, setDeleteTransferCandidates] = useState<DeleteTransferCandidate[]>([])
  const [selectedTransferTargetRouteLineId, setSelectedTransferTargetRouteLineId] = useState<string>('')
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef | null>(null)
  const [orientationOpen, setOrientationOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const buildEditUrl = useCallback((baseImageId: string, nextFaceImageId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextFaceImageId && nextFaceImageId !== baseImageId) {
      nextParams.set('face', nextFaceImageId)
    } else {
      nextParams.delete('face')
    }

    const query = nextParams.toString()
    return `/logbook/submissions/${baseImageId}/edit${query ? `?${query}` : ''}`
  }, [searchParams])

  useEffect(() => {
    setMode('edit-existing')
    setInteractionTool('draw')
    return () => {
      reset()
    }
  }, [setMode, setInteractionTool, reset])

  useEffect(() => {
    if (!activeImageId || existingRouteLines.length === 0 || !imageSelection || !('imageUrl' in imageSelection)) return

    // Break the loop: If we already loaded routes for this image, STOP.
    if (initializedImageIdRef.current === activeImageId) return

    let isActive = true
    const img = new window.Image()

    img.onload = () => {
      // If the effect was cleaned up (user switched images), abort.
      if (!isActive) return

      const normalizedRoutes = existingRouteLines.map((route) => ({
        ...route,
        points: normalizePoints(
          route.points,
          { width: img.width, height: img.height, naturalWidth: img.width, naturalHeight: img.height },
          route.image_width,
          route.image_height
        ),
      }))

      setRoutes(normalizedRoutes)

      // Lock the initialization for this image ID
      initializedImageIdRef.current = activeImageId
    }

    img.src = imageSelection.imageUrl

    // Cleanup function runs if dependencies change before onload fires
    return () => {
      isActive = false
    }
  }, [activeImageId, existingRouteLines, imageSelection, setRoutes])

  const loadSubmission = useCallback(async () => {
    if (!activeImageId) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        router.push(`/auth?redirect_to=${encodeURIComponent(buildEditUrl(routeImageId, activeImageId))}`)
        return
      }
      setCurrentUserId(user.id)

      const imageQuery = async (imageId: string) => {
        return supabase
          .from('images')
          .select(`
            id,
            url,
            created_by,
            crag_id,
            is_anonymous_submission,
            contribution_credit_platform,
            contribution_credit_handle,
            latitude,
            longitude,
            face_directions,
            crags:crag_id (id, name, region_name, sub_area),
            route_lines (
              id,
              points,
              sequence_order,
              image_width,
              image_height,
              climbs (id, name, grade, status, route_type, description, user_id)
            )
          `)
          .eq('id', imageId)
          .maybeSingle()
      }

      const firstAttempt = await imageQuery(activeImageId)
      let data = firstAttempt.data
      let imageError = firstAttempt.error

      if ((!data || imageError) && requestedFaceImageId && requestedFaceImageId !== routeImageId && activeImageId === requestedFaceImageId) {
        const fallbackAttempt = await imageQuery(routeImageId)
        if (fallbackAttempt.data && !fallbackAttempt.error) {
          router.replace(buildEditUrl(routeImageId))
          return
        }

        if (!data) {
          data = fallbackAttempt.data
        }
        if (!imageError) {
          imageError = fallbackAttempt.error
        }
      }

      if (imageError || !data) {
        const reason = imageError?.message || 'The submission could not be found or loaded.'
        console.error('Submission image query failed:', {
          activeImageId,
          routeImageId,
          requestedFaceImageId,
          reason,
        })
        setError(`Failed to load this submission. ${reason}`)
        return
      }

      const submission = data as EditableImageQuery

      if (submission.created_by !== user.id) {
        const { data: collaboratorAccess, error: collaboratorError } = await supabase
          .from('submission_collaborators')
          .select('image_id')
          .eq('image_id', activeImageId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (collaboratorError || !collaboratorAccess) {
          setError('You do not have access to edit this submission')
          return
        }
      }

      const mappedRouteLines = (submission.route_lines || [])
        .map((line) => {
          const climb = pickOne(line.climbs)
          if (!climb) return null

          const points = parsePoints(line.points)
          if (points.length < 2) return null

          return {
            id: line.id,
            image_id: submission.id,
            climb_id: climb.id,
            points,
            color: 'red',
            sequence_order: line.sequence_order,
            created_at: new Date().toISOString(),
            image_width: typeof line.image_width === 'number' ? line.image_width : undefined,
            image_height: typeof line.image_height === 'number' ? line.image_height : undefined,
            climb: {
              id: climb.id,
              name: climb.name,
              grade: climb.grade,
              status: climb.status,
              route_type: climb.route_type,
              description: climb.description,
            },
          } as RouteLine
        })
        .filter((line): line is RouteLine => line !== null)

      const mappedEditableRoutes: EditableRoute[] = mappedRouteLines.map((routeLine, index) => ({
        id: routeLine.id,
        name: routeLine.climb?.name || `Route ${index + 1}`,
        grade: routeLine.climb?.grade || '6A',
        description: routeLine.climb?.description || undefined,
        points: routeLine.points,
        sequenceOrder: typeof routeLine.sequence_order === 'number' ? routeLine.sequence_order : index,
      }))

      setImageSelection({
        mode: 'existing',
        imageId: submission.id,
        imageUrl: resolveRouteImageUrl(submission.url),
      })
      setLatitude(typeof submission.latitude === 'number' ? submission.latitude.toString() : '')
      setLongitude(typeof submission.longitude === 'number' ? submission.longitude.toString() : '')
      setInitialLatitude(typeof submission.latitude === 'number' ? submission.latitude.toString() : '')
      setInitialLongitude(typeof submission.longitude === 'number' ? submission.longitude.toString() : '')
      const resolvedLocationMode = submission.location_mode === 'shared' ? 'shared' : 'custom'
      setLocationMode(resolvedLocationMode)
      setInitialLocationMode(resolvedLocationMode)
      const submittedDirections = Array.isArray(submission.face_directions) ? submission.face_directions : []
      const normalizedDirections = FACE_DIRECTIONS.filter((direction) => submittedDirections.includes(direction))
      const linkedCrag = pickOne(submission.crags)
      setFaceDirections(normalizedDirections)
      setInitialFaceDirections(normalizedDirections)
      setCragId(typeof submission.crag_id === 'string' ? submission.crag_id : null)
      setCragName(linkedCrag?.name || '')
      setRegionTag(linkedCrag?.region_name || '')
      setSubArea(linkedCrag?.sub_area || '')
      setInitialCragName(linkedCrag?.name || '')
      setInitialRegionTag(linkedCrag?.region_name || '')
      setInitialSubArea(linkedCrag?.sub_area || '')
      setOwnerUserId(typeof submission.created_by === 'string' ? submission.created_by : null)
      const normalizedCreditPlatform = normalizeSubmissionCreditPlatform(submission.contribution_credit_platform)
      setCreditPlatform(normalizedCreditPlatform || 'instagram')
      setCreditHandle(submission.contribution_credit_handle || '')
      setIsAnonymousSubmission(submission.is_anonymous_submission === true)
      setInitialCreditPlatform(normalizedCreditPlatform)
      setInitialCreditHandle(submission.contribution_credit_handle || '')
      setInitialIsAnonymousSubmission(submission.is_anonymous_submission === true)
      setExistingRouteLines(mappedRouteLines)
      setInitialEditedRoutes(mappedEditableRoutes)
      setEditedRoutes(mappedEditableRoutes)
    } catch (error) {
      console.error('Failed to load submission editor state:', {
        activeImageId,
        routeImageId,
        requestedFaceImageId,
        error,
      })
      setError('Failed to load this submission. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [activeImageId, buildEditUrl, requestedFaceImageId, routeImageId, router])

  useEffect(() => {
    loadSubmission()
  }, [loadSubmission])

  const loadManageFaces = useCallback(async () => {
    if (!routeImageId) return

    setFacesLoading(true)
    try {
      const supabase = createClient()
      const { data: currentImage, error: currentImageError } = await supabase
        .from('images')
        .select('id, submission_id')
        .eq('id', routeImageId)
        .single()

      if (currentImageError || !currentImage) {
        setPrimaryManageImageId(routeImageId)
        setManageFaces([])
        return
      }

      const resolvedSubmissionId = typeof currentImage.submission_id === 'string' && currentImage.submission_id
        ? currentImage.submission_id
        : null
      const batchQuery = resolvedSubmissionId
        ? supabase
            .from('images')
            .select('id, submission_id, url, latitude, longitude, face_directions, is_primary, location_mode, face_order')
            .eq('submission_id', resolvedSubmissionId)
            .order('face_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true })
        : supabase
            .from('images')
            .select('id, submission_id, url, latitude, longitude, face_directions, is_primary, location_mode, face_order')
            .eq('id', routeImageId)

      const { data: batchImages, error: batchError } = await batchQuery

      if (batchError || !Array.isArray(batchImages)) {
        setPrimaryManageImageId(routeImageId)
        setManageFaces([])
        return
      }

      const nextFaces = (batchImages as SubmissionBatchImageQuery[])
        .map((image, index) => {
          const directions = Array.isArray(image.face_directions) && image.face_directions.length > 0
            ? image.face_directions.join('/')
            : null
          const defaultLabel = image.is_primary
            ? 'Primary'
            : `Image ${index + 1}`
          return {
            imageId: image.id,
            index,
            label: directions ? `${defaultLabel} (${directions})` : defaultLabel,
            isPrimary: image.is_primary,
            signedUrl: resolveRouteImageUrl(image.url),
            latitude: image.latitude,
            longitude: image.longitude,
            locationMode: resolveLocationMode(image.location_mode),
          }
        })

      const uniqueByImage = new Map<string, ManageFaceTab>(nextFaces.map((face) => [face.imageId, face]))
      const orderedFaces = [...uniqueByImage.values()]
      const resolvedPrimaryImageId = orderedFaces.find((face) => face.isPrimary)?.imageId || routeImageId
      const currentManagedImageId = requestedFaceImageId || routeImageId

      if (!orderedFaces.some((face) => face.imageId === currentManagedImageId)) {
        orderedFaces.push({ imageId: currentManagedImageId, index: orderedFaces.length, label: 'Current image', isPrimary: false, signedUrl: null, latitude: null, longitude: null })
      }

      setPrimaryManageImageId(resolvedPrimaryImageId)
      setManageFaces(orderedFaces)

      if (resolvedPrimaryImageId !== routeImageId) {
        router.replace(buildEditUrl(resolvedPrimaryImageId, currentManagedImageId))
      }
    } catch {
      setPrimaryManageImageId(routeImageId)
      setManageFaces([])
    } finally {
      setFacesLoading(false)
    }
  }, [buildEditUrl, requestedFaceImageId, routeImageId, router])

  useEffect(() => {
    void loadManageFaces()
  }, [loadManageFaces])

  const hasReadyData = useMemo(() => {
    return !!imageSelection
  }, [imageSelection])

  const collaborationAdded = searchParams.get('collab') === 'added'
  const publishedFacesParam = searchParams.get('publishedFaces')
  const publishedRoutesParam = searchParams.get('publishedRoutes')
  const hasShownPublishedToastRef = useRef(false)
  const initializedImageIdRef = useRef<string | null>(null)
  const canEditContributionCredit = !!currentUserId && !!ownerUserId && currentUserId === ownerUserId
  const canEditCragMetadata = !!currentUserId && !!ownerUserId && currentUserId === ownerUserId && !!cragId
  const markerPosition = useMemo<[number, number] | null>(() => {
    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null
    if (parsedLatitude < -90 || parsedLatitude > 90) return null
    if (parsedLongitude < -180 || parsedLongitude > 180) return null
    return [parsedLatitude, parsedLongitude]
  }, [latitude, longitude])
  const activeImageUrl = imageSelection?.mode === 'existing' || imageSelection?.mode === 'crag-image' ? imageSelection.imageUrl : ''

  const quickSwitcherImages = useMemo(() => {
    return manageFaces
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((face) => ({
        imageId: face.imageId,
        signedUrl: face.signedUrl || (face.imageId === activeImageId ? activeImageUrl : ''),
        badgeNumber: face.index + 1,
        isDefault: face.imageId === (primaryManageImageId || routeImageId),
        locationMode: face.locationMode,
      }))
      .filter((face) => face.signedUrl)
  }, [activeImageId, activeImageUrl, manageFaces, primaryManageImageId, routeImageId])

  const publishedDraftPins = useMemo<LightweightCragMapPin[]>(() => {
    return buildMapPins(manageFaces.map((face) => ({
      imageId: face.imageId,
      order: face.index,
      label: face.label,
      latitude: typeof face.latitude === 'number' ? face.latitude : null,
      longitude: typeof face.longitude === 'number' ? face.longitude : null,
      locationMode: face.locationMode || 'shared',
    })))
  }, [manageFaces])

  const focusDrawingArea = useCallback(() => {
    drawingAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleQuickSwitchImage = useCallback((imageId: string) => {
    if (imageId === activeImageId) {
      focusDrawingArea()
      return
    }
    router.replace(buildEditUrl(primaryManageImageId || routeImageId, imageId))
    window.setTimeout(() => {
      focusDrawingArea()
    }, 0)
  }, [activeImageId, buildEditUrl, focusDrawingArea, primaryManageImageId, routeImageId, router])

  const imageMetadataDirty = useMemo(() => {
    const initialLat = parseCoordinate(initialLatitude)
    const initialLng = parseCoordinate(initialLongitude)
    const currentLat = parseCoordinate(latitude)
    const currentLng = parseCoordinate(longitude)

    const coordsChanged = initialLat !== currentLat || initialLng !== currentLng
    const initialDirections = sortFaceDirections(initialFaceDirections).join('|')
    const currentDirections = sortFaceDirections(faceDirections).join('|')
    return coordsChanged || initialDirections !== currentDirections || initialLocationMode !== locationMode
  }, [initialLatitude, initialLongitude, latitude, longitude, initialFaceDirections, faceDirections, initialLocationMode, locationMode])

  const cragMetadataDirty = useMemo(() => {
    if (!canEditCragMetadata) return false
    const currentName = cragName.trim()
    const currentRegion = regionTag.trim()
    const currentSubArea = subArea.trim()
    const initialName = initialCragName.trim()
    const initialRegion = initialRegionTag.trim()
    const initialSubAreaValue = initialSubArea.trim()
    return currentName !== initialName || currentRegion !== initialRegion || currentSubArea !== initialSubAreaValue
  }, [canEditCragMetadata, cragName, regionTag, subArea, initialCragName, initialRegionTag, initialSubArea])

  const creditDirty = useMemo(() => {
    if (!canEditContributionCredit) return false

    const initialNormalizedHandle = normalizeSubmissionCreditHandle(initialCreditHandle)
    const currentNormalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
    const initialNormalizedPlatform = initialNormalizedHandle ? normalizeSubmissionCreditPlatform(initialCreditPlatform) : null
    const currentNormalizedPlatform = currentNormalizedHandle ? normalizeSubmissionCreditPlatform(creditPlatform) : null

    return initialNormalizedHandle !== currentNormalizedHandle || initialNormalizedPlatform !== currentNormalizedPlatform
  }, [canEditContributionCredit, initialCreditHandle, creditHandle, initialCreditPlatform, creditPlatform])

  const anonymityDirty = useMemo(() => {
    if (!canEditContributionCredit) return false
    return initialIsAnonymousSubmission !== isAnonymousSubmission
  }, [canEditContributionCredit, initialIsAnonymousSubmission, isAnonymousSubmission])

  const routeEditsDirty = useMemo(() => {
    if (initialEditedRoutes.length === 0 && editedRoutes.length === 0) return false

    const initialById = new Map(initialEditedRoutes.map((route) => [route.id, route]))
    const currentById = new Map(editedRoutes.map((route) => [route.id, route]))

    if (initialById.size !== currentById.size) return true

    for (const [routeId, initialRoute] of initialById) {
      const currentRoute = currentById.get(routeId)
      if (!currentRoute) return true
      if (routeEditSignature(initialRoute) !== routeEditSignature(currentRoute)) return true
    }

    return false
  }, [initialEditedRoutes, editedRoutes])

  const changedRouteGradeVotes = useMemo(() => {
    const initialById = new Map(initialEditedRoutes.map((route) => [route.id, route.grade]))

    return editedRoutes
      .map((route) => ({
        routeLineId: route.id,
        grade: route.grade,
        previousGrade: initialById.get(route.id),
      }))
      .filter((item) => item.previousGrade !== undefined && item.previousGrade !== item.grade)
      .map((item) => ({ routeLineId: item.routeLineId, grade: item.grade }))
  }, [initialEditedRoutes, editedRoutes])

  const hasPendingChanges = imageMetadataDirty || cragMetadataDirty || routeEditsDirty || changedRouteGradeVotes.length > 0 || creditDirty || anonymityDirty

  const routesToPersist = useMemo(() => {
    const initialById = new Map(initialEditedRoutes.map((route) => [route.id, route]))

    return editedRoutes.filter((route) => {
      const initialRoute = initialById.get(route.id)
      if (!initialRoute) return false
      return routeEditSignature(initialRoute) !== routeEditSignature(route)
    })
  }, [initialEditedRoutes, editedRoutes])

  const saveRouteEdits = useCallback(async () => {
    if (!activeImageId || routesToPersist.length === 0) return false

    setSavingEdits(true)
    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/routes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: routesToPersist }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save route edits')
      }
      setInitialEditedRoutes((previous) => previous.map((route) => {
        const updated = routesToPersist.find((candidate) => candidate.id === route.id)
        if (!updated) return route
        return {
          ...route,
          name: updated.name,
          description: updated.description,
          points: updated.points,
          sequenceOrder: updated.sequenceOrder,
        }
      }))
      return true
    } finally {
      setSavingEdits(false)
    }
  }, [activeImageId, routesToPersist])

  const handleDeleteExistingRoute = useCallback(async (routeLineId: string, transferTargetRouteLineId?: string) => {
    if (!activeImageId || !routeLineId || deletingExistingRouteId) return

    setDeletingExistingRouteId(routeLineId)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/routes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeLineId,
          transferLogsToSameName: true,
          targetRouteLineId: transferTargetRouteLineId || null,
        }),
      })

      const payload = await response.json().catch(() => ({} as {
        error?: string
        code?: string
        sourceRouteName?: string
        candidates?: DeleteTransferCandidate[]
        movedLogs?: number
        droppedDuplicateLogs?: number
      }))

      if (!response.ok) {
        if (response.status === 409 && payload?.code === 'multiple_transfer_targets' && Array.isArray(payload.candidates)) {
          const candidates = payload.candidates.filter((candidate: DeleteTransferCandidate) => candidate.routeLineId !== routeLineId)
          setDeleteTransferSourceRouteLineId(routeLineId)
          setDeleteTransferSourceName(payload.sourceRouteName || '')
          setDeleteTransferCandidates(candidates)
          setSelectedTransferTargetRouteLineId(candidates[0]?.routeLineId || '')
          return
        }

        throw new Error(payload?.error || 'Failed to delete route')
      }

      const movedLogs = typeof payload?.movedLogs === 'number' ? payload.movedLogs : 0
      const droppedDuplicateLogs = typeof payload?.droppedDuplicateLogs === 'number' ? payload.droppedDuplicateLogs : 0
      if (movedLogs > 0 || droppedDuplicateLogs > 0) {
        setSuccess(`Route deleted. Moved ${movedLogs} log${movedLogs === 1 ? '' : 's'}${droppedDuplicateLogs > 0 ? `, skipped ${droppedDuplicateLogs} duplicate${droppedDuplicateLogs === 1 ? '' : 's'}` : ''}.`)
      } else {
        setSuccess('Route deleted.')
      }

      setDeleteTransferSourceRouteLineId(null)
      setDeleteTransferSourceName('')
      setDeleteTransferCandidates([])
      setSelectedTransferTargetRouteLineId('')

      await loadSubmission()
      setCanvasKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route')
    } finally {
      setDeletingExistingRouteId(null)
    }
  }, [activeImageId, deletingExistingRouteId, loadSubmission])

  const toggleFaceDirection = useCallback((direction: FaceDirection) => {
    setFaceDirections((prev) => {
      if (prev.includes(direction)) {
        return prev.filter((value) => value !== direction)
      }
      return [...prev, direction]
    })
  }, [])

  const saveImageMetadata = useCallback(async () => {
    if (!activeImageId || !imageMetadataDirty) return false

    const parsedLatitude = parseCoordinate(latitude)
    const parsedLongitude = parseCoordinate(longitude)

    if (Number.isNaN(parsedLatitude) || (parsedLatitude !== null && (parsedLatitude < -90 || parsedLatitude > 90))) {
      throw new Error('Latitude must be between -90 and 90')
    }

    if (Number.isNaN(parsedLongitude) || (parsedLongitude !== null && (parsedLongitude < -180 || parsedLongitude > 180))) {
      throw new Error('Longitude must be between -180 and 180')
    }

    const response = await csrfFetch(`/api/submissions/${activeImageId}/image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        faceDirections,
        locationMode,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data?.error || 'Failed to update image metadata')
    }

    setInitialLatitude(latitude)
    setInitialLongitude(longitude)
    setInitialFaceDirections(faceDirections)
    setInitialLocationMode(locationMode)
    return true
  }, [activeImageId, imageMetadataDirty, latitude, longitude, faceDirections, locationMode])

  const saveCragMetadata = useCallback(async () => {
    if (!activeImageId || !canEditCragMetadata || !cragMetadataDirty) return false

    const trimmedCragName = cragName.trim()
    const trimmedRegionTag = regionTag.trim()
    if (!trimmedCragName) {
      throw new Error('Crag name is required')
    }
    if (!trimmedRegionTag) {
      throw new Error('Region tag is required')
    }

    const response = await csrfFetch(`/api/submissions/${activeImageId}/crag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cragName: trimmedCragName,
        regionTag: trimmedRegionTag,
        subArea: subArea.trim() || null,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update crag metadata')
    }

    setInitialCragName(trimmedCragName)
    setInitialRegionTag(trimmedRegionTag)
    setInitialSubArea(subArea.trim())
    return true
  }, [activeImageId, canEditCragMetadata, cragMetadataDirty, cragName, regionTag, subArea])

  const updateLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(nextLatitude.toFixed(6))
    setLongitude(nextLongitude.toFixed(6))
    setLocationSearchError(null)
  }, [])

  const handleSearchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return

    setSearchingLocation(true)
    setLocationSearchError(null)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) {
        setLocationSearchError('Search failed')
        return
      }

      const data = await response.json() as Array<{ lat?: number; lon?: number }> | null
      const first = Array.isArray(data) ? data[0] : null
      if (!first || typeof first.lat !== 'number' || typeof first.lon !== 'number') {
        setLocationSearchError('Location not found')
        return
      }

      updateLocation(first.lat, first.lon)
    } catch {
      setLocationSearchError('Failed to search location')
    } finally {
      setSearchingLocation(false)
    }
  }, [searchQuery, updateLocation])

  const loadCollaborators = useCallback(async () => {
    if (!activeImageId) return

    setLoadingCollaborators(true)
    try {
      const response = await fetch(`/api/submissions/${activeImageId}/collaborators`, { cache: 'no-store' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to load collaborators')
      }

      const data = await response.json() as {
        owner: {
          userId: string
          profile: {
            displayName: string
            username: string | null
          }
        } | null
        collaborators: CollaboratorItem[]
        isOwner: boolean
        activeInvites?: InviteItem[]
      }

      setOwnerUserId(data.owner?.userId || null)
      setOwnerProfile(data.owner?.profile || null)
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : [])
      setIsOwner(Boolean(data.isOwner))
      setActiveInvites(Array.isArray(data.activeInvites) ? data.activeInvites : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collaborators')
    } finally {
      setLoadingCollaborators(false)
    }
  }, [activeImageId])

  const handleCreateInvite = useCallback(async () => {
    if (!activeImageId || creatingInvite || !isOwner) return

    setCreatingInvite(true)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: null, expiresAt: null }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to create invite link')
      }

      const data = await response.json() as { invite?: { inviteUrl?: string } }
      const inviteUrl = data.invite?.inviteUrl || null
      setLatestInviteUrl(inviteUrl)
      setSuccess('Invite link created')
      await loadCollaborators()

      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        setSuccess('Invite link created and copied')
        addToast('Invite link copied', 'success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite link')
    } finally {
      setCreatingInvite(false)
    }
  }, [activeImageId, creatingInvite, isOwner, loadCollaborators, addToast])

  const handleCopyInvite = useCallback(async (inviteUrl: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setSuccess('Invite link copied')
      addToast('Invite link copied', 'success')
    } catch {
      setError('Failed to copy invite link')
      addToast('Failed to copy invite link', 'error')
    }
  }, [addToast])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!activeImageId || !isOwner || revokingInviteId) return

    setRevokingInviteId(inviteId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to revoke invite')
      }

      setSuccess('Invite revoked')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }, [activeImageId, isOwner, revokingInviteId, loadCollaborators])

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: string) => {
    if (!activeImageId || !isOwner || removingCollaboratorId) return

    setRemovingCollaboratorId(collaboratorUserId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators/${collaboratorUserId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to remove collaborator')
      }

      setSuccess('Collaborator removed')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [activeImageId, isOwner, removingCollaboratorId, loadCollaborators])

  const saveContributionCredit = useCallback(async () => {
    if (!activeImageId || !canEditContributionCredit || !creditDirty) return false

    const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
    if (creditHandle.trim().length > 0 && !normalizedHandle) {
      throw new Error('Invalid handle. Use letters, numbers, dots, underscores, or hyphens.')
    }

    const response = await csrfFetch(`/api/submissions/${activeImageId}/credit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: normalizedHandle ? creditPlatform : null,
        handle: normalizedHandle,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save contribution credit')
    }

    const updatedPlatform = normalizeSubmissionCreditPlatform(payload?.credit?.platform)
    const updatedHandle = typeof payload?.credit?.handle === 'string' ? payload.credit.handle : ''

    setCreditPlatform(updatedPlatform || 'instagram')
    setCreditHandle(updatedHandle)
    setInitialCreditPlatform(updatedPlatform)
    setInitialCreditHandle(updatedHandle)
    return true
  }, [activeImageId, canEditContributionCredit, creditDirty, creditHandle, creditPlatform])

  const saveAnonymousSubmission = useCallback(async () => {
    if (!activeImageId || !canEditContributionCredit || !anonymityDirty) return false

    const response = await csrfFetch(`/api/submissions/${activeImageId}/anonymous`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAnonymousSubmission }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update submission anonymity')
    }

    const updatedAnonymousSubmission = payload?.submission?.isAnonymousSubmission === true
    setIsAnonymousSubmission(updatedAnonymousSubmission)
    setInitialIsAnonymousSubmission(updatedAnonymousSubmission)
    return true
  }, [activeImageId, canEditContributionCredit, anonymityDirty, isAnonymousSubmission])

  const saveRouteGradeVotes = useCallback(async () => {
    if (!activeImageId || changedRouteGradeVotes.length === 0) return false

    const response = await csrfFetch(`/api/submissions/${activeImageId}/grade-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grades: changedRouteGradeVotes }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to save grade votes')
    }

    setInitialEditedRoutes((previous) => previous.map((route) => {
      const updated = changedRouteGradeVotes.find((candidate) => candidate.routeLineId === route.id)
      if (!updated) return route
      return {
        ...route,
        grade: updated.grade,
      }
    }))

    return true
  }, [activeImageId, changedRouteGradeVotes])

  const handleSaveAllChanges = useCallback(async () => {
    if (!hasPendingChanges || savingAllChanges) return

    setSavingAllChanges(true)
    setError(null)
    setSuccess(null)

    const savedLabels: string[] = []
    try {
      if (imageMetadataDirty) {
        await saveImageMetadata()
        savedLabels.push('image metadata')
      }

      if (cragMetadataDirty) {
        await saveCragMetadata()
        savedLabels.push('crag details')
      }

      if (changedRouteGradeVotes.length > 0) {
        await saveRouteGradeVotes()
        savedLabels.push('grade votes')
      }

      if (routeEditsDirty) {
        await saveRouteEdits()
        savedLabels.push('routes')
      }

      if (anonymityDirty) {
        await saveAnonymousSubmission()
        savedLabels.push('submission visibility')
      }

      if (creditDirty) {
        await saveContributionCredit()
        savedLabels.push('contribution credit')
      }

      setSuccess(savedLabels.length > 0 ? `Saved ${savedLabels.join(', ')}.` : 'No changes to save.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSavingAllChanges(false)
    }
  }, [
    hasPendingChanges,
    savingAllChanges,
    imageMetadataDirty,
    saveImageMetadata,
    cragMetadataDirty,
    saveCragMetadata,
    changedRouteGradeVotes.length,
    saveRouteGradeVotes,
    routeEditsDirty,
    saveRouteEdits,
    anonymityDirty,
    saveAnonymousSubmission,
    creditDirty,
    saveContributionCredit,
  ])

  useEffect(() => {
    if (hasShownPublishedToastRef.current) return

    const publishedFaces = Number(publishedFacesParam || '0')
    const publishedRoutes = Number(publishedRoutesParam || '0')
    if (!Number.isFinite(publishedFaces) || !Number.isFinite(publishedRoutes)) return
    if (publishedFaces <= 0 && publishedRoutes <= 0) return

    hasShownPublishedToastRef.current = true
    addToast(
      `Success! Created ${publishedRoutes} route${publishedRoutes === 1 ? '' : 's'} across ${publishedFaces} face${publishedFaces === 1 ? '' : 's'}.`,
      'success'
    )
  }, [publishedFacesParam, publishedRoutesParam, addToast])

  useEffect(() => {
    if (shareOpen) {
      loadCollaborators()
    }
  }, [shareOpen, loadCollaborators])

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <SubmissionToolbar
          hasPendingChanges={hasPendingChanges}
          savingAllChanges={savingAllChanges}
          onSaveAllChanges={handleSaveAllChanges}
        />

        {collaborationAdded && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit routes and image metadata.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        )}

        <SubmissionLocationPanel
          atlasSync={atlasSync}
          canEditCragMetadata={canEditCragMetadata}
          cragName={cragName}
          onCragNameChange={setCragName}
          regionTag={regionTag}
          onRegionTagChange={setRegionTag}
          subArea={subArea}
          onSubAreaChange={setSubArea}
          latitude={latitude}
          onLatitudeChange={setLatitude}
          longitude={longitude}
          onLongitudeChange={setLongitude}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchLocation={handleSearchLocation}
          searchingLocation={searchingLocation}
          locationSearchError={locationSearchError}
        />

        {hasReadyData && activeImageUrl ? (
          <SubmissionWorkstation
            drawingAreaRef={drawingAreaRef}
            routeCanvasRef={routeCanvasRef}
            quickSwitcherImages={quickSwitcherImages}
            activeImageId={activeImageId}
            activeImageUrl={activeImageUrl}
            draftPins={publishedDraftPins}
            publishedPins={[]}
            initialCenter={markerPosition}
            onSelectImage={handleQuickSwitchImage}
            onReorderImages={async (imageIds) => {
              const reorderedFaces = reorderItemsByIds(manageFaces, imageIds)
              setManageFaces(reorderedFaces)
              const response = await csrfFetch(`/api/submissions/${activeImageId}/faces`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageIds }),
              })
              if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data?.error || 'Failed to reorder images')
              }
            }}
            existingRouteLines={existingRouteLines}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(routeId) => {
              setSelectedRoute(routeId)
              setActiveRoute(routeId)
              setEditorPanelOpen(true)
            }}
            onReorderRoutes={(routeIds) => {
              const reordered = resequenceRoutes(existingRouteLines, routeIds)
              setExistingRouteLines(reordered)
              setEditedRoutes((prev) => resequenceRoutes(prev, routeIds))
            }}
            interactionTool={interactionTool === 'select' ? 'select' : 'draw'}
            currentPointsCount={currentPoints.length}
            onSetSelectTool={() => {
              setInteractionTool('select')
              setEditorPanelOpen(true)
            }}
            onSetDrawTool={() => {
              setInteractionTool('draw')
              setEditorPanelOpen(false)
            }}
            onUndoPoint={() => undoLastPoint()}
            onFinishRoute={() => routeCanvasRef.current?.finishRoute()}
            canvasKey={`${canvasKey}:${activeImageId}`}
            extraAction={facesLoading ? <span className="px-2 text-[11px] text-gray-500 dark:text-gray-400">Loading...</span> : null}
            onRoutesUpdate={(routes) => {
              const editableRoutes = routes.map((route) => ({
                id: route.id,
                name: route.climb?.name || 'Unnamed',
                grade: route.climb?.grade || '6A',
                description: route.climb?.description ?? undefined,
                points: route.points,
                sequenceOrder: typeof route.sequence_order === 'number' ? route.sequence_order : 0,
              }))
              setEditedRoutes(editableRoutes)
            }}
          />
        ) : null}

        <SubmissionDetailsPanel
          detailsOpen={detailsOpen}
          onDetailsToggle={() => setDetailsOpen((prev) => !prev)}
          orientationOpen={orientationOpen}
          onOrientationToggle={() => setOrientationOpen((prev) => !prev)}
          faceDirections={faceDirections}
          onToggleFaceDirection={toggleFaceDirection}
          onShareOpen={() => setShareOpen(true)}
          canEditCredit={canEditContributionCredit}
          isAnonymous={isAnonymousSubmission}
          onAnonymousChange={setIsAnonymousSubmission}
          creditPlatform={creditPlatform}
          onCreditPlatformChange={setCreditPlatform}
          creditHandle={creditHandle}
          onCreditHandleChange={setCreditHandle}
        />

        <DeleteRouteTransferDialog
          open={deleteTransferCandidates.length > 0 && !!deleteTransferSourceRouteLineId}
          sourceRouteName={deleteTransferSourceName}
          candidates={deleteTransferCandidates}
          selectedTargetRouteLineId={selectedTransferTargetRouteLineId}
          onSelectedTargetChange={setSelectedTransferTargetRouteLineId}
          deleting={!!deleteTransferSourceRouteLineId && deletingExistingRouteId === deleteTransferSourceRouteLineId}
          onConfirm={() => {
            if (!deleteTransferSourceRouteLineId || !selectedTransferTargetRouteLineId) return
            void handleDeleteExistingRoute(deleteTransferSourceRouteLineId, selectedTransferTargetRouteLineId)
          }}
          onCancel={() => {
            setDeleteTransferSourceRouteLineId(null)
            setDeleteTransferSourceName('')
            setDeleteTransferCandidates([])
            setSelectedTransferTargetRouteLineId('')
          }}
        />

        <CollaboratorDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Collaborators"
          description="Create a link for collaborators to edit routes, location, and face directions."
          isOwner={isOwner}
          ownerUserId={ownerUserId}
          ownerProfile={ownerProfile}
          collaborators={collaborators}
          activeInvites={activeInvites}
          loadingCollaborators={loadingCollaborators}
          creatingInvite={creatingInvite}
          revokingInviteId={revokingInviteId}
          removingCollaboratorId={removingCollaboratorId}
          latestInviteUrl={latestInviteUrl}
          inviteUrlPrefix="/api/submissions/collaborate"
          onCreateInvite={handleCreateInvite}
          onCopyInvite={handleCopyInvite}
          onRevokeInvite={handleRevokeInvite}
          onRemoveCollaborator={handleRemoveCollaborator}
        />
      </div>
    </div>
  )
}
