'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { normalizePoints } from '@/lib/canvasMath'
import { createClient } from '@/lib/supabase'
import { resolveRouteImageUrl } from '@/features/media/utils/route-image-url'
import { FACE_DIRECTIONS, type FaceDirection, type ImageSelection, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import { buildMapPins, resolveLocationMode } from '@/lib/editor-image-state'
import { useRouteStore } from '@/store/routeStore'

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
  } | Array<{
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
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
  location_mode?: string | null
  crags?: { name: string; region_name: string | null; sub_area: string | null } | Array<{ name: string; region_name: string | null; sub_area: string | null }> | null
  route_lines: ImageRouteLineQuery[] | null
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
  if (Array.isArray(raw)) return raw.filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number').map((p) => ({ x: p.x, y: p.y }))
  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number').map((p) => ({ x: p.x, y: p.y })) : []
  } catch {
    return []
  }
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export function useSubmissionEditorData() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const routeImageId = params.imageId as string
  const requestedFaceImageId = searchParams.get('face')
  const activeImageId = requestedFaceImageId || routeImageId
  const { setRoutes, setMode, setInteractionTool, reset } = useRouteStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null)
  const [existingRouteLines, setExistingRouteLines] = useState<RouteLine[]>([])
  const [editedRoutes, setEditedRoutes] = useState<RouteLine[]>([])
  const [initialEditedRoutes, setInitialEditedRoutes] = useState<RouteLine[]>([])
  const [canvasKey, setCanvasKey] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [cragId, setCragId] = useState<string | null>(null)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [cragName, setCragName] = useState('')
  const [regionTag, setRegionTag] = useState('')
  const [subArea, setSubArea] = useState('')
  const [faceDirections, setFaceDirections] = useState<FaceDirection[]>([])
  const [initialLatitude, setInitialLatitude] = useState('')
  const [initialLongitude, setInitialLongitude] = useState('')
  const [initialCragName, setInitialCragName] = useState('')
  const [initialRegionTag, setInitialRegionTag] = useState('')
  const [initialSubArea, setInitialSubArea] = useState('')
  const [initialFaceDirections, setInitialFaceDirections] = useState<FaceDirection[]>([])
  const [locationMode, setLocationMode] = useState<'shared' | 'custom'>('custom')
  const [initialLocationMode, setInitialLocationMode] = useState<'shared' | 'custom'>('custom')
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [isAnonymousSubmission, setIsAnonymousSubmission] = useState(false)
  const [initialIsAnonymousSubmission, setInitialIsAnonymousSubmission] = useState(false)
  const [initialCreditPlatform, setInitialCreditPlatform] = useState<SubmissionCreditPlatform | null>(null)
  const [initialCreditHandle, setInitialCreditHandle] = useState('')
  const [manageFaces, setManageFaces] = useState<ManageFaceTab[]>([])
  const [primaryManageImageId, setPrimaryManageImageId] = useState<string | null>(routeImageId)
  const initializedImageIdRef = useRef<string | null>(null)

  const canEditContributionCredit = !!currentUserId && !!ownerUserId && currentUserId === ownerUserId
  const canEditCragMetadata = !!currentUserId && !!ownerUserId && currentUserId === ownerUserId && !!cragId
  const hasReadyData = !!imageSelection
  const markerPosition = useMemo<[number, number] | null>(() => {
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90) return null
    if (lng < -180 || lng > 180) return null
    return [lat, lng]
  }, [latitude, longitude])
  const activeImageUrl = imageSelection?.mode === 'existing' || imageSelection?.mode === 'crag-image' ? imageSelection.imageUrl : ''
  const quickSwitcherImages = useMemo(() => manageFaces.slice().sort((a, b) => a.index - b.index).map((face) => ({ imageId: face.imageId, signedUrl: face.signedUrl || (face.imageId === activeImageId ? activeImageUrl : ''), badgeNumber: face.index + 1, isDefault: face.imageId === (primaryManageImageId || routeImageId), locationMode: face.locationMode })).filter((face) => face.signedUrl), [activeImageId, activeImageUrl, manageFaces, primaryManageImageId, routeImageId])
  const publishedDraftPins = useMemo(() => buildMapPins(manageFaces.map((face) => ({ imageId: face.imageId, order: face.index, label: face.label, latitude: typeof face.latitude === 'number' ? face.latitude : null, longitude: typeof face.longitude === 'number' ? face.longitude : null, locationMode: face.locationMode || 'shared' }))), [manageFaces])
  const imageMetadataDirty = useMemo(() => initialLatitude !== latitude || initialLongitude !== longitude || JSON.stringify(initialFaceDirections) !== JSON.stringify(faceDirections) || initialLocationMode !== locationMode, [faceDirections, initialFaceDirections, initialLatitude, initialLocationMode, initialLongitude, latitude, locationMode, longitude])
  const cragMetadataDirty = useMemo(() => canEditCragMetadata && (cragName.trim() !== initialCragName.trim() || regionTag.trim() !== initialRegionTag.trim() || subArea.trim() !== initialSubArea.trim()), [canEditCragMetadata, cragName, initialCragName, initialRegionTag, initialSubArea, regionTag, subArea])
  const creditDirty = useMemo(() => canEditContributionCredit && (initialCreditPlatform !== creditPlatform || initialCreditHandle !== creditHandle), [canEditContributionCredit, creditHandle, creditPlatform, initialCreditHandle, initialCreditPlatform])
  const anonymityDirty = useMemo(() => canEditContributionCredit && initialIsAnonymousSubmission !== isAnonymousSubmission, [canEditContributionCredit, initialIsAnonymousSubmission, isAnonymousSubmission])
  const routeEditsDirty = useMemo(() => false, [])
  const changedRouteGradeVotes = useMemo(() => [], [])
  const hasPendingChanges = imageMetadataDirty || cragMetadataDirty || routeEditsDirty || changedRouteGradeVotes.length > 0 || creditDirty || anonymityDirty
  const routesToPersist = useMemo(() => [], [])

  const buildEditUrl = useCallback((baseImageId: string, nextFaceImageId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextFaceImageId && nextFaceImageId !== baseImageId) nextParams.set('face', nextFaceImageId)
    else nextParams.delete('face')
    const query = nextParams.toString()
    return `/logbook/submissions/${baseImageId}/edit${query ? `?${query}` : ''}`
  }, [searchParams])

  useEffect(() => {
    setMode('edit-existing')
    setInteractionTool('draw')
    return () => reset()
  }, [reset, setInteractionTool, setMode])

  useEffect(() => {
    if (!activeImageId || existingRouteLines.length === 0 || !imageSelection || !('imageUrl' in imageSelection)) return
    if (initializedImageIdRef.current === activeImageId) return
    let isActive = true
    const img = new window.Image()
    img.onload = () => {
      if (!isActive) return
      const normalizedRoutes = existingRouteLines.map((route) => ({ ...route, points: normalizePoints(route.points, { width: img.width, height: img.height, naturalWidth: img.width, naturalHeight: img.height }, route.image_width, route.image_height) }))
      setRoutes(normalizedRoutes)
      initializedImageIdRef.current = activeImageId
    }
    img.src = imageSelection.imageUrl
    return () => { isActive = false }
  }, [activeImageId, existingRouteLines, imageSelection, setRoutes])

  const loadSubmission = useCallback(async () => {
    if (!activeImageId) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) { router.push(`/auth?redirect_to=${encodeURIComponent(buildEditUrl(routeImageId, activeImageId))}`); return }
      setCurrentUserId(user.id)
      const imageQuery = async (imageId: string) => supabase.from('images').select(`id, url, created_by, crag_id, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, latitude, longitude, face_directions, crags:crag_id (name, region_name, sub_area), route_lines ( id, points, sequence_order, image_width, image_height, climbs (id, name, grade, status, route_type, description) )`).eq('id', imageId).maybeSingle()
      const firstAttempt = await imageQuery(activeImageId)
      let data = firstAttempt.data
      let imageError = firstAttempt.error
      if ((!data || imageError) && requestedFaceImageId && requestedFaceImageId !== routeImageId && activeImageId === requestedFaceImageId) {
        const fallbackAttempt = await imageQuery(routeImageId)
        if (fallbackAttempt.data && !fallbackAttempt.error) { router.replace(buildEditUrl(routeImageId)); return }
        if (!data) data = fallbackAttempt.data
        if (!imageError) imageError = fallbackAttempt.error
      }
      if (imageError || !data) { setError(`Failed to load this submission. ${imageError?.message || 'The submission could not be found or loaded.'}`); return }
      const submission = data as EditableImageQuery
      if (submission.created_by !== user.id) {
        const { data: collaboratorAccess, error: collaboratorError } = await supabase.from('submission_collaborators').select('image_id').eq('image_id', activeImageId).eq('user_id', user.id).maybeSingle()
        if (collaboratorError || !collaboratorAccess) { setError('You do not have access to edit this submission'); return }
      }
      const mappedRouteLines = (submission.route_lines || []).map((line) => {
        const climb = pickOne(line.climbs)
        if (!climb) return null
        const points = parsePoints(line.points)
        if (points.length < 2) return null
        return { id: line.id, image_id: submission.id, climb_id: climb.id, points, color: 'red', sequence_order: line.sequence_order, created_at: new Date().toISOString(), image_width: typeof line.image_width === 'number' ? line.image_width : undefined, image_height: typeof line.image_height === 'number' ? line.image_height : undefined, climb: { id: climb.id, name: climb.name, grade: climb.grade, status: climb.status, route_type: climb.route_type, description: climb.description } } as RouteLine
      }).filter((line): line is RouteLine => line !== null)
      setImageSelection({ mode: 'existing', imageId: submission.id, imageUrl: resolveRouteImageUrl(submission.url) })
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
      setInitialEditedRoutes(mappedRouteLines)
      setEditedRoutes(mappedRouteLines)
    } catch {
      setError('Failed to load this submission. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [activeImageId, buildEditUrl, requestedFaceImageId, routeImageId, router])

  useEffect(() => { loadSubmission() }, [loadSubmission])

  const loadManageFaces = useCallback(async () => {
    if (!routeImageId) return
    const supabase = createClient()
    const { data: currentImage, error: currentImageError } = await supabase.from('images').select('id, submission_id').eq('id', routeImageId).single()
    if (currentImageError || !currentImage) { setPrimaryManageImageId(routeImageId); setManageFaces([]); return }
    const resolvedSubmissionId = typeof currentImage.submission_id === 'string' && currentImage.submission_id ? currentImage.submission_id : null
    const batchQuery = resolvedSubmissionId ? supabase.from('images').select('id, submission_id, url, latitude, longitude, face_directions, is_primary, location_mode, face_order').eq('submission_id', resolvedSubmissionId).order('face_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }) : supabase.from('images').select('id, submission_id, url, latitude, longitude, face_directions, is_primary, location_mode, face_order').eq('id', routeImageId)
    const { data: batchImages, error: batchError } = await batchQuery
    if (batchError || !Array.isArray(batchImages)) { setPrimaryManageImageId(routeImageId); setManageFaces([]); return }
    const nextFaces = (batchImages as Array<{ id: string; url: string; latitude: number | null; longitude: number | null; face_directions: string[] | null; is_primary: boolean; location_mode?: string | null }>).map((image, index) => ({ imageId: image.id, index, label: `${image.is_primary ? 'Primary' : `Image ${index + 1}`}${Array.isArray(image.face_directions) && image.face_directions.length > 0 ? ` (${image.face_directions.join('/')})` : ''}`, isPrimary: image.is_primary, signedUrl: resolveRouteImageUrl(image.url), latitude: image.latitude, longitude: image.longitude, locationMode: resolveLocationMode(image.location_mode) }))
    const uniqueByImage = new Map<string, ManageFaceTab>(nextFaces.map((face) => [face.imageId, face]))
    const orderedFaces = [...uniqueByImage.values()]
    const resolvedPrimaryImageId = orderedFaces.find((face) => face.isPrimary)?.imageId || routeImageId
    const currentManagedImageId = requestedFaceImageId || routeImageId
    if (!orderedFaces.some((face) => face.imageId === currentManagedImageId)) orderedFaces.push({ imageId: currentManagedImageId, index: orderedFaces.length, label: 'Current image', isPrimary: false, signedUrl: null, latitude: null, longitude: null })
    setPrimaryManageImageId(resolvedPrimaryImageId)
    setManageFaces(orderedFaces)
    if (resolvedPrimaryImageId !== routeImageId) router.replace(buildEditUrl(resolvedPrimaryImageId, currentManagedImageId))
  }, [buildEditUrl, requestedFaceImageId, routeImageId, router])
  useEffect(() => { void loadManageFaces() }, [loadManageFaces])

  const handleQuickSwitchImage = useCallback((imageId: string) => {
    if (imageId === activeImageId) return
    router.replace(buildEditUrl(primaryManageImageId || routeImageId, imageId))
  }, [activeImageId, buildEditUrl, primaryManageImageId, routeImageId, router])

  return {
    loading,
    error,
    success,
    setError,
    setSuccess,
    imageSelection,
    existingRouteLines,
    editedRoutes,
    setEditedRoutes,
    initialEditedRoutes,
    setInitialEditedRoutes,
    canvasKey,
    setCanvasKey,
    currentUserId,
    ownerUserId,
    cragId,
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    cragName,
    setCragName,
    regionTag,
    setRegionTag,
    subArea,
    setSubArea,
    faceDirections,
    setFaceDirections,
    initialLatitude,
    initialLongitude,
    initialCragName,
    initialRegionTag,
    initialSubArea,
    initialFaceDirections,
    locationMode,
    setLocationMode,
    initialLocationMode,
    setInitialLocationMode,
    creditPlatform,
    setCreditPlatform,
    creditHandle,
    setCreditHandle,
    isAnonymousSubmission,
    setIsAnonymousSubmission,
    initialIsAnonymousSubmission,
    initialCreditPlatform,
    initialCreditHandle,
    manageFaces,
    setManageFaces,
    primaryManageImageId,
    setPrimaryManageImageId,
    hasReadyData,
    markerPosition,
    activeImageUrl,
    quickSwitcherImages,
    publishedDraftPins,
    canEditContributionCredit,
    canEditCragMetadata,
    imageMetadataDirty,
    cragMetadataDirty,
    creditDirty,
    anonymityDirty,
    routeEditsDirty,
    changedRouteGradeVotes,
    hasPendingChanges,
    routesToPersist,
    routeImageId,
    activeImageId,
    requestedFaceImageId,
    buildEditUrl,
    handleQuickSwitchImage,
    toggleFaceDirection: (direction: FaceDirection) => setFaceDirections((prev) => prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction]),
  }
}
