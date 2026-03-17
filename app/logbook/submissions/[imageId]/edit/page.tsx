'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import NextImage from 'next/image'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Link2, MapPin, Search, Trash2, Users } from 'lucide-react'
import { useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { UnifiedRouteCanvas } from '@/components/UnifiedRouteCanvas'
import { useRouteStore } from '@/store/routeStore'
import { normalizePoints } from '@/lib/canvasMath'
import AtlasContextCard from '@/components/submissions/atlas-context-card'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/hooks/use-atlas-auto-sync'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { createClient } from '@/lib/supabase'
import {
  normalizeSubmissionCreditHandle,
  normalizeSubmissionCreditPlatform,
  type SubmissionCreditPlatform,
} from '@/lib/submission-credit'
import { FACE_DIRECTIONS, type FaceDirection, type ImageSelection, type NewRouteData, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToastContainer, useToast } from '@/components/logbook/toast'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

interface EditableRoute {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
}

interface CollaboratorItem {
  userId: string
  role: string
  createdAt: string
  profile: {
    displayName: string
    username: string | null
    avatarUrl: string | null
  }
}

interface InviteItem {
  id: string
  token: string
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  createdAt: string
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
  created_by: string | null
  crag_id: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  latitude: number | null
  longitude: number | null
  face_directions: string[] | null
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

interface FaceSummaryItem {
  id: string
  image_id?: string | null
  index?: number
  is_primary: boolean
  url?: string | null
  has_routes: boolean
  face_directions?: string[] | null
}

interface FacesResponsePayload {
  primary_image_id?: string
  faces?: FaceSummaryItem[]
}

interface ManageFaceTab {
  imageId: string
  index: number
  label: string
  isPrimary: boolean
  signedUrl: string | null
}

const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const
const CREDIT_PLATFORM_OPTIONS: Array<{ value: SubmissionCreditPlatform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
]

function normalizeRouteType(value: string | null | undefined): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  const canonical = normalized === 'bouldering' ? 'boulder' : normalized
  if (!VALID_ROUTE_TYPES.includes(canonical as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }
  return canonical as (typeof VALID_ROUTE_TYPES)[number]
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

function MapClickHandler({ onClick }: { onClick: (event: L.LeafletMouseEvent) => void }) {
  useMapEvents({ click: onClick })
  return null
}

function MapRecenter({ position }: { position: [number, number] | null }) {
  const map = useMapEvents({})

  useEffect(() => {
    if (!position) return
    map.setView(position, Math.max(map.getZoom(), 14))
  }, [map, position])

  return null
}

function parseCoordinate(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

function sortFaceDirections(directions: FaceDirection[]): FaceDirection[] {
  return [...directions].sort((a, b) => FACE_DIRECTIONS.indexOf(a) - FACE_DIRECTIONS.indexOf(b))
}

function normalizePointForCompare(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function routeEditSignature(route: EditableRoute): string {
  return JSON.stringify({
    id: route.id,
    name: route.name.trim(),
    description: (route.description || '').trim(),
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
  const [savingEdits, setSavingEdits] = useState(false)
  const [savingNewRoutes, setSavingNewRoutes] = useState(false)
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
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const parsedLatitude = useMemo(() => parseCoordinate(latitude), [latitude])
  const parsedLongitude = useMemo(() => parseCoordinate(longitude), [longitude])

  const { setRoutes, setMode, setInteractionTool, reset, interactionTool, commitCurrentRoute, currentPoints, undoLastPoint } = useRouteStore()
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
    import('leaflet').then((lib) => setLeaflet(lib))
  }, [])

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

      const { data, error: imageError } = await supabase
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
        .eq('id', activeImageId)
        .single()

      if (imageError || !data) {
        setError('Failed to load this submission')
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
    } catch {
      setError('Failed to load this submission')
    } finally {
      setLoading(false)
    }
  }, [activeImageId, buildEditUrl, routeImageId, router])

  useEffect(() => {
    loadSubmission()
  }, [loadSubmission])

  const loadManageFaces = useCallback(async () => {
    if (!routeImageId) return

    setFacesLoading(true)
    try {
      const response = await fetch(`/api/images/${routeImageId}/faces`, { cache: 'no-store' })
      if (!response.ok) {
        setPrimaryManageImageId(routeImageId)
        setManageFaces([])
        return
      }

      const payload = await response.json() as FacesResponsePayload
      const resolvedPrimaryImageId = typeof payload.primary_image_id === 'string' && payload.primary_image_id
        ? payload.primary_image_id
        : routeImageId
      const faces = Array.isArray(payload.faces) ? payload.faces : []
      const nextFaces = faces
        .filter((face): face is FaceSummaryItem & { image_id: string } => typeof face.image_id === 'string' && !!face.image_id)
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((face, index) => {
          const directions = Array.isArray(face.face_directions) && face.face_directions.length > 0
            ? face.face_directions.join('/')
            : null
          const defaultLabel = face.is_primary
            ? 'Primary'
            : `Face ${index + 1}`
          return {
            imageId: face.image_id,
            index,
            label: directions ? `${defaultLabel} (${directions})` : defaultLabel,
            isPrimary: face.is_primary,
            signedUrl: typeof face.url === 'string' && face.url ? face.url : null,
          }
        })

      const uniqueByImage = new Map(nextFaces.map((face) => [face.imageId, face]))
      const orderedFaces = [...uniqueByImage.values()]
      const currentManagedImageId = requestedFaceImageId || routeImageId
      const hasCurrentImage = orderedFaces.some((face) => face.imageId === currentManagedImageId)
      if (!hasCurrentImage) {
        orderedFaces.push({ imageId: currentManagedImageId, index: orderedFaces.length, label: 'Current image', isPrimary: false, signedUrl: null })
      }
      setPrimaryManageImageId(resolvedPrimaryImageId)
      setManageFaces(orderedFaces)

      const shouldNormalizeRoute = resolvedPrimaryImageId !== routeImageId
      if (shouldNormalizeRoute) {
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

  const preferredRouteType = useMemo(() => {
    const uniqueTypes = new Set<(typeof VALID_ROUTE_TYPES)[number]>()
    for (const routeLine of existingRouteLines) {
      const normalized = normalizeRouteType(routeLine.climb?.route_type)
      if (normalized) uniqueTypes.add(normalized)
    }

    if (uniqueTypes.size !== 1) return null
    return [...uniqueTypes][0]
  }, [existingRouteLines])

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

  const imageMetadataDirty = useMemo(() => {
    const initialLat = parseCoordinate(initialLatitude)
    const initialLng = parseCoordinate(initialLongitude)
    const currentLat = parseCoordinate(latitude)
    const currentLng = parseCoordinate(longitude)

    const coordsChanged = initialLat !== currentLat || initialLng !== currentLng
    const initialDirections = sortFaceDirections(initialFaceDirections).join('|')
    const currentDirections = sortFaceDirections(faceDirections).join('|')
    return coordsChanged || initialDirections !== currentDirections
  }, [initialLatitude, initialLongitude, latitude, longitude, initialFaceDirections, faceDirections])

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
        }
      }))
      return true
    } finally {
      setSavingEdits(false)
    }
  }, [activeImageId, routesToPersist])

  const handleCreateRoutes = useCallback(async (routesToCreate: NewRouteData[]) => {
    if (savingNewRoutes || !activeImageId || routesToCreate.length === 0) return

    setSavingNewRoutes(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: routesToCreate, routeType: preferredRouteType }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to add new routes')
      }

      setSuccess(`Added ${routesToCreate.length} new route${routesToCreate.length === 1 ? '' : 's'}.`)
      await loadSubmission()
      setCanvasKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add new routes')
    } finally {
      setSavingNewRoutes(false)
    }
  }, [savingNewRoutes, activeImageId, loadSubmission, preferredRouteType])

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
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data?.error || 'Failed to update image metadata')
    }

    setInitialLatitude(latitude)
    setInitialLongitude(longitude)
    setInitialFaceDirections(faceDirections)
    return true
  }, [activeImageId, imageMetadataDirty, latitude, longitude, faceDirections])

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

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    updateLocation(event.latlng.lat, event.latlng.lng)
  }, [updateLocation])

  const handleMarkerDragEnd = useCallback((event: L.LeafletEvent) => {
    const marker = event.target as L.Marker
    const next = marker.getLatLng()
    updateLocation(next.lat, next.lng)
  }, [updateLocation])

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
        <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/80 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
          <div className="flex items-center justify-between gap-3">
          <Link
            href="/logbook"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to logbook
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={!hasPendingChanges || savingAllChanges}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {savingAllChanges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save all changes
            </button>
          </div>
          </div>
        </div>

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

        {manageFaces.length > 0 && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manage all images</h2>
              {facesLoading ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">Loading faces...</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {manageFaces.map((face) => {
                const active = face.imageId === activeImageId
                return (
                  <button
                    key={face.imageId}
                    type="button"
                    onClick={() => {
                      if (active) return
                      router.replace(buildEditUrl(primaryManageImageId || routeImageId, face.imageId))
                    }}
                    className={`rounded-md border p-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="relative mb-1 h-16 w-full overflow-hidden rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                      {face.signedUrl ? (
                        <NextImage
                          src={face.signedUrl}
                          alt={face.isPrimary ? 'Primary face' : `Face ${face.index + 1}`}
                          fill
                          unoptimized
                          sizes="160px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-gray-500 dark:text-gray-400">
                          No preview
                        </div>
                      )}
                    </div>
                    {face.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <details className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900" open={cragMetadataDirty}>
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100">Location details</summary>
          <div className="mt-3 space-y-3">
            <AtlasContextCard result={atlasSync} />
            {canEditCragMetadata ? (
              <>
                <label className="text-xs text-gray-600 dark:text-gray-300">
                  Crag name
                  <input
                    value={cragName}
                    onChange={(event) => setCragName(event.target.value)}
                    placeholder="e.g. Leaning Tower"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <label className="text-xs text-gray-600 dark:text-gray-300">
                  Region tag
                  <input
                    value={regionTag}
                    onChange={(event) => setRegionTag(event.target.value)}
                    placeholder="e.g. Yosemite Valley"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <label className="text-xs text-gray-600 dark:text-gray-300">
                  Sub-area (optional)
                  <input
                    value={subArea}
                    onChange={(event) => setSubArea(event.target.value)}
                    placeholder="e.g. Valley S Side"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Only the submission owner can edit crag and region details.
              </p>
            )}
          </div>
        </details>

        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Image location and face directions</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Latitude
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="e.g. 48.4049"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Longitude
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="e.g. 2.6920"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          </div>

          {mapOpen ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">Click map or drag marker to adjust location</p>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Done
                </button>
              </div>
              <div className="h-72 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <MapContainer
                  center={markerPosition || [20, 0]}
                  zoom={markerPosition ? 14 : 2}
                  style={{ height: '100%', width: '100%' }}
                >
                  <MapRecenter position={markerPosition} />
                  <MapClickHandler onClick={handleMapClick} />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Imagery © Esri"
                    maxZoom={19}
                  />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    attribution="Labels © Esri"
                    maxZoom={19}
                  />
                  {markerPosition && leaflet ? (
                    <Marker
                      position={markerPosition}
                      draggable={true}
                      icon={leaflet.divIcon({
                        className: 'location-marker',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                      })}
                      eventHandlers={{ dragend: handleMarkerDragEnd }}
                    />
                  ) : null}
                </MapContainer>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="mt-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Adjust location on map
            </button>
          )}

          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearchLocation()
                  }
                }}
                placeholder="Search for a location..."
                className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void handleSearchLocation()
              }}
              disabled={searchingLocation}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {searchingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Search
            </button>
          </div>

          {locationSearchError ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{locationSearchError}</p>
          ) : null}

          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FACE_DIRECTIONS.map((direction) => {
              const selected = faceDirections.includes(direction)
              return (
                <button
                  key={direction}
                  type="button"
                  onClick={() => toggleFaceDirection(direction)}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  {direction}
                </button>
              )
            })}
          </div>

        </div>

        {hasReadyData && imageSelection && 'imageUrl' in imageSelection ? (
          <>
            <div className="flex gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  interactionTool === 'select'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                onClick={() => setInteractionTool('select')}
              >
                Select/Edit
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  interactionTool === 'draw'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                onClick={() => setInteractionTool('draw')}
              >
                Draw Route
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  currentPoints.length > 0
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
                onClick={() => undoLastPoint()}
                disabled={currentPoints.length === 0}
              >
                Undo Point
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  currentPoints.length >= 2
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
                onClick={() => commitCurrentRoute()}
                disabled={currentPoints.length < 2}
              >
                Finish Route
              </button>
            </div>
            <div className="h-[calc(100dvh-9rem)] md:h-[calc(100vh-7rem)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
              <UnifiedRouteCanvas
              key={`${canvasKey}:${activeImageId}`}
              mode="edit-existing"
              imageUrl={imageSelection.imageUrl}
              onRoutesUpdate={(routes) => {
                const editableRoutes = routes.map((route) => ({
                  id: route.id,
                  name: route.climb?.name || 'Unnamed',
                  grade: route.climb?.grade || '6A',
                  description: route.climb?.description ?? undefined,
                  points: route.points,
                }))
                setEditedRoutes(editableRoutes)
              }}
            />
            </div>
          </>
        ) : null}

        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Collaborators</h2>
            </div>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Manage collaborators
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contribution credit</h2>
          </div>

          {canEditContributionCredit ? (
            <>
              <label className="mb-3 flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={isAnonymousSubmission}
                  onChange={(event) => setIsAnonymousSubmission(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                />
                <span>
                  <span className="block font-medium text-gray-900 dark:text-gray-100">Keep this submission anonymous</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    This removes the upload from your public profile and hides your submitter name and credit link on the climb page.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="text-xs text-gray-600 dark:text-gray-300">
                  Platform
                  <select
                    value={creditPlatform}
                    onChange={(event) => setCreditPlatform(event.target.value as SubmissionCreditPlatform)}
                    disabled={isAnonymousSubmission}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {CREDIT_PLATFORM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-600 dark:text-gray-300 md:col-span-2">
                  Handle
                  <input
                    value={creditHandle}
                    onChange={(event) => setCreditHandle(event.target.value)}
                    placeholder="handle"
                    disabled={isAnonymousSubmission}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {isAnonymousSubmission
                  ? 'Credit is hidden while anonymous mode is on.'
                  : `Shown publicly as @${normalizeSubmissionCreditHandle(creditHandle) || 'handle'}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Only the original contributor can edit contribution credit.
            </p>
          )}
        </div>

        <Dialog
          open={deleteTransferCandidates.length > 0 && !!deleteTransferSourceRouteLineId}
          onOpenChange={(open) => {
            if (open) return
            setDeleteTransferSourceRouteLineId(null)
            setDeleteTransferSourceName('')
            setDeleteTransferCandidates([])
            setSelectedTransferTargetRouteLineId('')
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose route to inherit logs</DialogTitle>
              <DialogDescription>
                Multiple routes named {deleteTransferSourceName ? `"${deleteTransferSourceName}"` : 'the same'} were found on this image. Pick one target before deleting.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Transfer logs to
                <select
                  value={selectedTransferTargetRouteLineId}
                  onChange={(event) => setSelectedTransferTargetRouteLineId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  {deleteTransferCandidates.map((candidate) => (
                    <option key={candidate.routeLineId} value={candidate.routeLineId}>
                      {candidate.climbName}{candidate.grade ? ` (${candidate.grade})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTransferSourceRouteLineId(null)
                    setDeleteTransferSourceName('')
                    setDeleteTransferCandidates([])
                    setSelectedTransferTargetRouteLineId('')
                  }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!deleteTransferSourceRouteLineId || !selectedTransferTargetRouteLineId) return
                    void handleDeleteExistingRoute(deleteTransferSourceRouteLineId, selectedTransferTargetRouteLineId)
                  }}
                  disabled={!deleteTransferSourceRouteLineId || !selectedTransferTargetRouteLineId || deletingExistingRouteId === deleteTransferSourceRouteLineId}
                  className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deletingExistingRouteId === deleteTransferSourceRouteLineId ? 'Deleting...' : 'Transfer and delete'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Collaborators</DialogTitle>
              <DialogDescription>
                Create a link for collaborators to edit routes, location, and face directions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  <Link2 className="h-4 w-4" />
                  Invite link
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={creatingInvite}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create new link
                  </button>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Only the owner can create invite links.</p>
                )}

                {latestInviteUrl && (
                  <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                    <p className="break-all text-gray-700 dark:text-gray-200">{latestInviteUrl}</p>
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(latestInviteUrl)}
                      className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Copy link
                    </button>
                  </div>
                )}

                {activeInvites.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {activeInvites.map((invite) => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : ''
                      const inviteUrl = `${origin}/api/submissions/collaborate/${invite.token}`
                      return (
                        <div key={invite.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-700">
                          <p className="break-all text-gray-600 dark:text-gray-300">{inviteUrl}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyInvite(inviteUrl)}
                              className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Copy
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(invite.id)}
                                disabled={revokingInviteId === invite.id}
                                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                              >
                                {revokingInviteId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  <Users className="h-4 w-4" />
                  Collaborators
                </div>

                {loadingCollaborators ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading collaborators...
                  </div>
                ) : collaborators.length === 0 ? (
                  <div className="space-y-2">
                    {ownerUserId && ownerProfile ? (
                      <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {ownerProfile.displayName} (Owner)
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm text-gray-500 dark:text-gray-400">No collaborators yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ownerUserId && ownerProfile ? (
                      <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {ownerProfile.displayName} (Owner)
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                        </div>
                      </div>
                    ) : null}
                    {collaborators.map((collaborator) => {
                      const isOwnerRow = ownerUserId === collaborator.userId
                      return (
                        <div key={collaborator.userId} className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {collaborator.profile.displayName}
                              {isOwnerRow ? ' (Owner)' : ''}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{collaborator.profile.username ? `@${collaborator.profile.username}` : 'No username'}</p>
                          </div>
                          {isOwner && !isOwnerRow ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCollaborator(collaborator.userId)}
                              disabled={removingCollaboratorId === collaborator.userId}
                              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {removingCollaboratorId === collaborator.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Remove
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
