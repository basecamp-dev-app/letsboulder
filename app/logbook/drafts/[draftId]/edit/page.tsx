'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { UserResponse } from '@supabase/supabase-js'
import { type UnifiedRouteCanvasRef } from '@/components/UnifiedRouteCanvas'
import { type LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { SubmissionWorkstation } from '@/components/SubmissionWorkstation'
import { useRouteStore } from '@/store/route-store'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/hooks/use-atlas-auto-sync'
import { useDraftUploadManager, useMediaUploadManager, type MediaUploadItem, type UploadCompleteCallback } from '@/lib/media/media-upload-manager'
import { uploadDebug } from '@/lib/media/upload-debug'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import type { ClimbType } from '@/lib/submission-types'
import { type FaceDirection, type ImageSelection, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { normalizeDraftMetadata, serializeDraftMetadataV2, type OrientationDirection } from '@/lib/draft-metadata'
import { createClient } from '@/lib/supabase'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/lib/editor-image-state'
import type { EditableRoute } from '@/lib/editor-types'
import { sortFaceDirections, coordinateKey } from '@/lib/editor-helpers'
import { CollaboratorDialog } from '@/components/editor/collaborator-dialog'
import { useDraftEditorData } from './hooks/use-draft-editor-data'
import { useDraftConflictResolution } from './hooks/use-draft-conflict-resolution'
import { useDraftCollaborators } from './hooks/use-draft-collaborators'
import { useDraftLocationMetadata } from './hooks/use-draft-location-metadata'
import { useDraftRouteEditing } from './hooks/use-draft-route-editing'
import { formatCoordinate } from '@/features/editor/location/location-metadata'
import { haveStoredRoutesChanged } from '@/features/editor/route-store-sync'
import { areSerializedRoutesEqual, buildHighResCanvasUrl, buildRouteCompletionPayload, buildRouteWorkflowSignature, parseSerializedRouteData } from '@/features/route-editor/route-editor-utils'
import { DraftToolbar } from './components/draft-toolbar'
import { DraftMetadataPanel } from './components/draft-metadata-panel'
import { DraftDetailsPanel } from './components/draft-details-panel'
import { DraftUploadQueue } from './components/draft-upload-queue'

interface DraftImagePayload {
  id: string
  display_order: number
  route_data: Record<string, unknown> | null
  proxy_url: string | null
  readiness_status: 'ready' | 'processing' | 'error'
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
}

interface DraftPayload {
  id: string
  user_id: string
  crag_id: string | null
  status: string
  updated_at: string
  last_edited_by: string | null
  metadata: Record<string, unknown> | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
}

function isDraftImageReady(image: DraftImagePayload): boolean {
  return (image.readiness_status === 'ready' || image.readiness_status === 'processing') && !!image.proxy_url
}

interface CragImagePayload {
  id: string
  signed_url: string | null
  linked_image_id: string | null
  display_image_id?: string | null
  width: number | null
  height: number | null
  latitude?: number | null
  longitude?: number | null
}

interface DraftSavePayload {
  images: Array<{
    id: string
    display_order: number
    route_data: Record<string, unknown>
  }>
  cragId: string | null
  metadata: Record<string, unknown>
}

interface CanvasSourceMetadata {
  submission?: {
    canvasSource?: {
      kind?: 'draft-image' | 'crag-image'
      draftImageId?: string
      cragImageId?: string
      cragId?: string
    }
  }
}

interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data?: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name?: string | null
  }
}

interface DraftDeleteImageResponse {
  success: boolean
  deleted_image_id?: string
  draft?: {
    updated_at?: string
    metadata?: Record<string, unknown> | null
  } | null
}

interface DraftRoute {
  id: string
  name: string
  grade: string
  description?: string
  climbType?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

interface ManageImageTab {
  imageId: string
  sourceKind: 'draft-image' | 'crag-image'
  index: number
  label: string
  signedUrl: string
  latitude: number | null
  longitude: number | null
  locationMode?: 'shared' | 'custom'
  status?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  error?: string | null
  pendingClientId?: string | null
}

type DraftCanvasSource =
  | { kind: 'draft-image'; draftImageId: string }
  | { kind: 'crag-image'; cragImageId: string; cragId: string }

interface PublishedCragImagePin {
  id: string
  latitude: number
  longitude: number
}

function buildManageImageLabel(index: number, imageId: string, defaultImageId: string | null, directions?: OrientationDirection[]): string {
  const directionsLabel = Array.isArray(directions) && directions.length > 0 ? ` (${directions.join('/')})` : ''
  return imageId === defaultImageId ? `Default${directionsLabel}` : `Image ${index + 1}${directionsLabel}`
}

function resolveDraftClimbType(value: string): ClimbType {
  if (value === 'sport' || value === 'boulder' || value === 'trad' || value === 'deep-water-solo') {
    return value
  }
  return 'boulder'
}

function isValidLocationCoordinate(latitude: number | null | undefined, longitude: number | null | undefined): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0)
}


export default function EditDraftPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string
  const { conflict, setConflict, clearConflict } = useDraftConflictResolution()
  const { detailsOpen, setDetailsOpen, orientationOpen, setOrientationOpen } = useDraftRouteEditing()

  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [, setIsRefreshingDraft] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [manageImages, setManageImages] = useState<ManageImageTab[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [defaultImageId, setDefaultImageId] = useState<string | null>(null)
  const [orientationByImageId, setOrientationByImageId] = useState<Record<string, OrientationDirection[]>>({})
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, DraftRoute[]>>({})
  const [locationModeByImageId, setLocationModeByImageId] = useState<Record<string, 'shared' | 'custom'>>({})
  const [customGpsByImageId, setCustomGpsByImageId] = useState<Record<string, { latitude: number | null; longitude: number | null }>>({})

  const [routeType, setRouteType] = useState<string>('sport')
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [isAnonymousSubmission, setIsAnonymousSubmission] = useState(false)
  const { showCragSelector, setShowCragSelector, latitude, setLatitude, longitude, setLongitude, searchQuery, setSearchQuery, searchingLocation, setSearchingLocation, mapOpen, setMapOpen, updateDraftLocation } = useDraftLocationMetadata()
  const markerPosition = useMemo<[number, number] | null>(() => {
    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null
    if (parsedLatitude < -90 || parsedLatitude > 90) return null
    if (parsedLongitude < -180 || parsedLongitude > 180) return null
    if (parsedLatitude === 0 && parsedLongitude === 0) return null
    return [parsedLatitude, parsedLongitude]
  }, [latitude, longitude])
  const [cragId, setCragId] = useState<string | null>(null)
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [selectedCrag, setSelectedCrag] = useState<{
    id: string
    name: string
    latitude: number | null
    longitude: number | null
  } | null>(null)
  const [canvasSource, setCanvasSource] = useState<DraftCanvasSource | null>(null)
  const [cragCanvasImages, setCragCanvasImages] = useState<CragImagePayload[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [ownerUserId] = useState<string | null>(null)
  const [ownerProfile] = useState<{ displayName: string; username: string | null } | null>(null)
  const [addingImages, setAddingImages] = useState(false)
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)
  const addImageInputRef = useRef<HTMLInputElement | null>(null)
  const publishRequirementsRef = useRef<HTMLDivElement | null>(null)
  const cragSectionRef = useRef<HTMLDivElement | null>(null)
  const locationSectionRef = useRef<HTMLDivElement | null>(null)
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const hasShownCollabToastRef = useRef(false)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const hasLoadedRoutesRef = useRef(false)
  const lastPersistedRoutesRef = useRef('')
  const autosavePausedRef = useRef(false)
  const autosavePausedSnapshotRef = useRef('')
  const previousActiveImageIdRef = useRef<string | null>(null)
  const lastSeededRouteImageIdRef = useRef<string | null>(null)
  const skipRouteStoreSyncRef = useRef<string | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef>(null)
  const hasHydratedLocationRef = useRef(false)
  const lastLocationSyncRef = useRef<string | null>(null)
  const isFetchingRef = useRef(false)
  const needsRefetchRef = useRef(false)
  const draftIdRef = useRef(draftId)
  const draftRef = useRef<DraftPayload | null>(null)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'pending' | 'saving' | 'syncing' | 'saved'>('idle')
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const { setMode, setInteractionTool, reset, clearCanvasState, selectedRouteId, routes: routeStoreRoutes, setRoutes: setRouteStoreRoutes, setSelectedRoute, setActiveRoute, setEditorPanelOpen, currentPoints, interactionTool, undoLastPoint } = useRouteStore()
  const { uploads, hasPendingUploads, hasFailedUploads, retryUpload, removeUpload, registerDraftUpdatedAt, queueDraftUploads, resumeQueue, isQueuePaused, subscribeToUploadComplete } = useDraftUploadManager()
  const { getUploadsForCrag } = useMediaUploadManager()
  const { shareOpen, setShareOpen, loadingCollaborators, collaborators, activeInvites, creatingInvite, revokingInviteId, removingCollaboratorId, latestInviteUrl, loadCollaborators, handleCreateInvite, handleCopyInvite, handleRevokeInvite, handleRemoveCollaborator } = useDraftCollaborators(draftId, isOwner, addToast, setError)
  const uploadsRef = useRef<MediaUploadItem[]>([])

  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [publishedCragPins, setPublishedCragPins] = useState<PublishedCragImagePin[]>([])
  const atlasSync = useAtlasAutoSync(markerPosition?.[0] ?? null, markerPosition?.[1] ?? null)
  const markerLatitude = markerPosition?.[0] ?? null
  const markerLongitude = markerPosition?.[1] ?? null
  const atlasCountryId = atlasSync.atlas?.countryId ?? null
  const atlasCountryCode = atlasSync.atlas?.countryCode ?? null
  const atlasCountryName = atlasSync.atlas?.countryName ?? null
  const atlasAdminRegionName = atlasSync.atlas?.adminRegionName ?? null
  const atlasUnRegionName = atlasSync.atlas?.unRegionName ?? null
  const atlasContinentName = atlasSync.atlas?.continentName ?? null
  const nearbyCragId = atlasSync.nearbyCrag?.id ?? null
  const nearbyCragName = atlasSync.nearbyCrag?.name ?? null
  const { imagesPayload, imagesPayloadSignature } = useDraftEditorData({ draft, routeType, routesByImageId, manageImages })
  const autosaveSignature = useMemo(() => buildRouteWorkflowSignature({
    imagesPayloadSignature,
    defaultImageId,
    routeType,
    markerLatitude,
    markerLongitude,
    cragId,
    isAnonymousSubmission,
    creditPlatform,
    creditHandle,
    sectorId,
    canvasSource,
    orientationByImageId,
    locationModeByImageId,
    customGpsByImageId,
  }), [canvasSource, creditHandle, creditPlatform, cragId, customGpsByImageId, defaultImageId, imagesPayloadSignature, isAnonymousSubmission, locationModeByImageId, markerLatitude, markerLongitude, orientationByImageId, routeType, sectorId])

  const loadDraft = useCallback(async () => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId) return

    const isFirstLoad = !draftRef.current
    if (isFirstLoad) {
      setIsInitialLoading(true)
    } else {
      setIsRefreshingDraft(true)
    }
    setError(null)
    try {
      const response = await fetch(`/api/submissions/drafts/${currentDraftId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({} as { draft?: DraftPayload; isOwner?: boolean; error?: string }))
      if (!response.ok || !payload?.draft) {
        throw new Error(payload.error || 'Failed to load draft')
      }

      const nextDraft = payload.draft
      const allDraftImages = [...(nextDraft.images || [])]
        .sort((a, b) => a.display_order - b.display_order)
      const persistedImages = allDraftImages.filter((image) => image.id && typeof image.id === 'string')
      const sortedImages = persistedImages.filter((image) => isDraftImageReady(image))
      const hasPersistedImageRows = allDraftImages.length > 0
      const hasProcessingPersistedImages = allDraftImages.some((image) => image.readiness_status === 'processing')
      const hasErroredPersistedImages = hasPersistedImageRows && allDraftImages.every((image) => image.readiness_status === 'error')
      const hasPendingDraftUploadRows = currentDraftId
        ? uploadsRef.current.some((upload) => upload.target.kind === 'draft' && upload.target.draftId === currentDraftId)
        : false

      const metadata = nextDraft.metadata && typeof nextDraft.metadata === 'object' ? nextDraft.metadata : {}
      const normalizedMetadata = normalizeDraftMetadata(metadata, persistedImages)
      const canvasMetadata = metadata as Record<string, unknown> as CanvasSourceMetadata
      const nextDefaultImageId = normalizedMetadata.navigation.defaultImageId || persistedImages[0]?.id || null
      const nextOrientationByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, OrientationDirection[]>>((acc, image) => {
        if (Array.isArray(image.orientation) && image.orientation.length > 0) {
          acc[image.imageId] = image.orientation
        }
        return acc
      }, {})
      const nextLocationModeByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, 'shared' | 'custom'>>((acc, image) => {
        acc[image.imageId] = image.locationMode === 'custom' ? 'custom' : 'shared'
        return acc
      }, {})
      const nextCustomGpsByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, { latitude: number | null; longitude: number | null }>>((acc, image) => {
        acc[image.imageId] = {
          latitude: typeof image.gps?.latitude === 'number' ? image.gps.latitude : null,
          longitude: typeof image.gps?.longitude === 'number' ? image.gps.longitude : null,
        }
        return acc
      }, {})

      const nextRoutesByImageId: Record<string, DraftRoute[]> = {}
      persistedImages.forEach((image) => {
        nextRoutesByImageId[image.id] = parseSerializedRouteData(image.route_data, image.width || 1200, image.height || 1200)
      })
      const nextManageImages = sortedImages.map<ManageImageTab>((image, index) => {
        const directions = nextOrientationByImageId[image.id]
        return {
          imageId: image.id,
          sourceKind: 'draft-image',
          index,
          label: buildManageImageLabel(index, image.id, nextDefaultImageId, directions),
          signedUrl: image.proxy_url || '',
          latitude: typeof image.latitude === 'number' ? image.latitude : null,
          longitude: typeof image.longitude === 'number' ? image.longitude : null,
          locationMode: nextLocationModeByImageId[image.id] || 'shared',
        }
      })

      const normalizedRouteType = typeof normalizedMetadata.submission.routeType === 'string' && normalizedMetadata.submission.routeType
        ? normalizedMetadata.submission.routeType
        : 'sport'

      const normalizedCreditPlatform = normalizeSubmissionCreditPlatform((metadata as { contributionCreditPlatform?: unknown }).contributionCreditPlatform)
      const normalizedCreditHandle = typeof (metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle === 'string'
        ? String((metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle)
        : ''
      const normalizedAnonymousSubmission = normalizedMetadata.submission.isAnonymousSubmission
      const metadataLocation = normalizedMetadata.submission.location
      const metadataLatitude = metadataLocation && typeof metadataLocation === 'object' && typeof (metadataLocation as { latitude?: unknown }).latitude === 'number'
        ? (metadataLocation as { latitude: number }).latitude
        : null
      const metadataLongitude = metadataLocation && typeof metadataLocation === 'object' && typeof (metadataLocation as { longitude?: unknown }).longitude === 'number'
        ? (metadataLocation as { longitude: number }).longitude
        : null

      const cragRelation = Array.isArray(nextDraft.crags) ? nextDraft.crags[0] : nextDraft.crags
      const nextCrag = nextDraft.crag_id
        ? {
            id: nextDraft.crag_id,
            name: cragRelation?.name || 'Selected crag',
            latitude: typeof cragRelation?.latitude === 'number' ? cragRelation.latitude : 0,
            longitude: typeof cragRelation?.longitude === 'number' ? cragRelation.longitude : 0,
          }
        : null

      setDraft(nextDraft)
      setDraftUpdatedAt(nextDraft.updated_at)
      registerDraftUpdatedAt(nextDraft.id, nextDraft.updated_at)
      clearConflict()
      setManageImages(nextManageImages)
      setDefaultImageId(nextDefaultImageId)
      setActiveImageId((current) => {
        if (current && sortedImages.some((image) => image.id === current)) return current
        if (nextDefaultImageId) return nextDefaultImageId
        return current
      })
      setOrientationByImageId(nextOrientationByImageId)
      setLocationModeByImageId(nextLocationModeByImageId)
      setCustomGpsByImageId(nextCustomGpsByImageId)
      setRoutesByImageId(nextRoutesByImageId)
      hasLoadedRoutesRef.current = true
      const savedCanvasSource = canvasMetadata.submission?.canvasSource
      lastPersistedRoutesRef.current = buildRouteWorkflowSignature({
        imagesPayloadSignature: JSON.stringify(buildRouteCompletionPayload(nextDraft.images, nextRoutesByImageId, normalizedRouteType, nextManageImages.map((image) => image.imageId))),
        defaultImageId: nextDefaultImageId,
        routeType: normalizedRouteType,
        markerLatitude: typeof metadataLatitude === 'number' ? metadataLatitude : null,
        markerLongitude: typeof metadataLongitude === 'number' ? metadataLongitude : null,
        cragId: nextDraft.crag_id,
        isAnonymousSubmission: normalizedAnonymousSubmission,
        creditPlatform: normalizedCreditPlatform || 'instagram',
        creditHandle: normalizedCreditHandle,
        sectorId,
        canvasSource: savedCanvasSource?.kind === 'crag-image'
          ? {
              kind: 'crag-image',
              cragImageId: savedCanvasSource.cragImageId,
              cragId: savedCanvasSource.cragId,
            }
          : savedCanvasSource?.kind === 'draft-image'
            ? {
                kind: 'draft-image',
                draftImageId: savedCanvasSource.draftImageId,
              }
            : null,
        orientationByImageId: nextOrientationByImageId,
        locationModeByImageId: nextLocationModeByImageId,
        customGpsByImageId: nextCustomGpsByImageId,
      })
      autosavePausedRef.current = false
      autosavePausedSnapshotRef.current = ''
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
      setAutosaveState('idle')
      setRouteType(normalizedRouteType)
      setCreditPlatform(normalizedCreditPlatform || 'instagram')
      setCreditHandle(normalizedCreditHandle)
      setIsAnonymousSubmission(normalizedAnonymousSubmission)
      setLatitude(typeof metadataLatitude === 'number' ? metadataLatitude.toString() : '')
      setLongitude(typeof metadataLongitude === 'number' ? metadataLongitude.toString() : '')
      setCragId(nextDraft.crag_id)
      setSelectedCrag(nextCrag)
      setShowCragSelector(!nextDraft.crag_id)
      if (savedCanvasSource?.kind === 'crag-image' && typeof savedCanvasSource.cragImageId === 'string' && typeof savedCanvasSource.cragId === 'string') {
        setCanvasSource({ kind: 'crag-image', cragImageId: savedCanvasSource.cragImageId, cragId: savedCanvasSource.cragId })
        setActiveImageId(savedCanvasSource.cragImageId)
      } else if (nextDefaultImageId) {
        setCanvasSource({ kind: 'draft-image', draftImageId: nextDefaultImageId })
      }
      hasHydratedLocationRef.current = false
      const metadataLocationContext = normalizedMetadata.submission.location ?? null
      lastLocationSyncRef.current = JSON.stringify({
        latitude: typeof metadataLatitude === 'number' ? metadataLatitude : null,
        longitude: typeof metadataLongitude === 'number' ? metadataLongitude : null,
        countryId: metadataLocationContext?.countryId ?? null,
        countryCode: metadataLocationContext?.countryCode ?? null,
        countryName: metadataLocationContext?.countryName ?? null,
        adminRegionName: metadataLocationContext?.adminRegionName ?? null,
        unRegionName: metadataLocationContext?.unRegionName ?? null,
        continentName: metadataLocationContext?.continentName ?? null,
        cragId: nextDraft.crag_id,
      })
      if (typeof payload.isOwner === 'boolean') {
        setIsOwner(payload.isOwner)
      }

      if (hasErroredPersistedImages && !hasPendingDraftUploadRows) {
        setError('Some photos failed to prepare for the editor. Try re-uploading the affected images.')
      } else if ((hasProcessingPersistedImages && sortedImages.length === 0) || hasPendingDraftUploadRows) {
        setError(null)
      }
    } catch (loadError) {
      if (loadError instanceof DOMException ? loadError.name === 'AbortError' : loadError instanceof Error && loadError.name === 'AbortError') {
        return
      }
      const message = loadError instanceof Error ? loadError.message : 'Failed to load draft'
      setError(message)
    } finally {
      if (isFirstLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshingDraft(false)
      }
    }
  }, [clearConflict, registerDraftUpdatedAt, sectorId, setLatitude, setLongitude, setShowCragSelector])

  const syncUploadedImages = useCallback(async () => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId || !draft) return

    try {
      await loadDraft()
    } catch (error) {
      uploadDebug('sync-uploaded-images-failed', { draftId: currentDraftId, error: String(error) })
    }
  }, [draft, loadDraft])

  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  useEffect(() => {
    if (!cragId) {
      setPublishedCragPins([])
      setCragCanvasImages([])
      return
    }

    let cancelled = false

    async function loadPublishedCragPins() {
      try {
        const response = await fetch(`/api/crags/${cragId}/images`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({} as { images?: Array<{ id?: string; display_image_id?: string; linked_image_id?: string | null; signed_url?: string | null; width?: number | null; height?: number | null; latitude?: number | null; longitude?: number | null }> }))
        if (!response.ok || !Array.isArray(payload.images)) {
          if (!cancelled) setPublishedCragPins([])
          return
        }

        if (!cancelled) {
          const imageItems = payload.images as Array<{ id?: string; display_image_id?: string; linked_image_id?: string | null; signed_url?: string | null; width?: number | null; height?: number | null; latitude?: number | null; longitude?: number | null }>
          const nextCragImages: CragImagePayload[] = imageItems.map((image) => ({
            id: typeof image.id === 'string' ? image.id : '',
            signed_url: typeof image.signed_url === 'string' ? image.signed_url : null,
            linked_image_id: typeof image.linked_image_id === 'string' ? image.linked_image_id : null,
            display_image_id: typeof image.display_image_id === 'string' ? image.display_image_id : null,
            width: typeof image.width === 'number' ? image.width : null,
            height: typeof image.height === 'number' ? image.height : null,
            latitude: typeof image.latitude === 'number' ? image.latitude : null,
            longitude: typeof image.longitude === 'number' ? image.longitude : null,
          })).filter((image) => Boolean(image.id))
          setCragCanvasImages(nextCragImages)
        }

        const nextPins = payload.images
          .map((image: { id?: string; display_image_id?: string; latitude?: number | null; longitude?: number | null }) => {
            const latitude = typeof image.latitude === 'number' ? image.latitude : null
            const longitude = typeof image.longitude === 'number' ? image.longitude : null
            const id = typeof image.display_image_id === 'string' && image.display_image_id
              ? image.display_image_id
              : typeof image.id === 'string'
                ? image.id
                : null
            if (!id || latitude === null || longitude === null) return null
            return { id, latitude, longitude }
          })
          .filter((image: PublishedCragImagePin | null): image is PublishedCragImagePin => image !== null)

        if (!cancelled) {
          setPublishedCragPins(nextPins)
        }
      } catch {
        if (!cancelled) setPublishedCragPins([])
      }
    }

    void loadPublishedCragPins()

    return () => {
      cancelled = true
    }
  }, [cragId])

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }: UserResponse) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [])

  useEffect(() => {
    import('leaflet').then((lib) => setLeaflet(lib))
  }, [])

  useEffect(() => {
    void loadCollaborators()
  }, [loadCollaborators])

  const collaborationAdded = searchParams.get('collab') === 'added'

  useEffect(() => {
    if (!collaborationAdded || hasShownCollabToastRef.current) return
    addToast('You were added as a draft collaborator', 'success')
    hasShownCollabToastRef.current = true
  }, [collaborationAdded, addToast])

  const pendingDraftUploads = useMemo(() => draftId ? uploads.filter((upload: MediaUploadItem) => upload.target.kind === 'draft' && upload.target.draftId === draftId) : [], [draftId, uploads])

  const queuePaused = useMemo(() => isQueuePaused(draftId || undefined), [draftId, isQueuePaused])
  const pendingCragUploads = useMemo(() => cragId ? getUploadsForCrag(cragId) : [], [cragId, getUploadsForCrag])

  const mergedCragCanvasImages = useMemo(() => {
    const persisted = cragCanvasImages
      .filter((image) => image.signed_url)
      .map<ManageImageTab>((image, index) => ({
        imageId: image.id,
        sourceKind: 'crag-image' as const,
        index,
        label: `Crag image ${index + 1}`,
        signedUrl: image.signed_url || '',
        latitude: typeof image.latitude === 'number' ? image.latitude : null,
        longitude: typeof image.longitude === 'number' ? image.longitude : null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    // Optimistic entries: crag uploads that just succeeded but haven't appeared in persisted yet
    const optimistic = pendingCragUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !cragCanvasImages.some((img) => img.id === upload.attachedRecordId))
      .map<ManageImageTab>((upload) => ({
        imageId: upload.attachedRecordId!,
        sourceKind: 'crag-image' as const,
        index: persisted.length,
        label: 'Crag image (syncing...)',
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pending = pendingCragUploads
      .filter((upload) => !upload.attachedRecordId)
      .map<ManageImageTab>((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'crag-image' as const,
        index: persisted.length + optimistic.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...persisted, ...optimistic, ...pending]
  }, [cragCanvasImages, pendingCragUploads])

  const mergedManageImages = useMemo(() => {
    // Optimistic entries: uploads that just succeeded but haven't appeared in manageImages yet
    const optimisticTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !manageImages.some((img) => img.imageId === upload.attachedRecordId))
      .map((upload) => ({
        imageId: upload.attachedRecordId!,
        sourceKind: 'draft-image' as const,
        index: manageImages.length,
        label: 'Image (syncing...)',
        signedUrl: upload.previewUrl || `/api/media/private?draftId=${draftId}&path=${encodeURIComponent(upload.uploadedPath!)}`,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pendingTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => !upload.attachedRecordId)
      .map((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'draft-image' as const,
        index: manageImages.length + optimisticTabs.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...manageImages, ...optimisticTabs, ...pendingTabs].sort((a, b) => a.index - b.index)
  }, [draftId, manageImages, pendingDraftUploads])

  const stableCanvasUrlRef = useRef<{ imageId: string | null; imageUrl: string }>({ imageId: null, imageUrl: '' })

  const hasInFlightDraftUploads = useMemo(() => {
    return pendingDraftUploads.some((upload) => (
      upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING'
    ))
  }, [pendingDraftUploads])

  useEffect(() => {
    if (!draftId) return
    const handleUploadComplete: UploadCompleteCallback = (_target, _clientId, attachedRecordId, newUpdatedAt) => {
      if (newUpdatedAt) {
        setDraftUpdatedAt(newUpdatedAt)
        registerDraftUpdatedAt(draftId, newUpdatedAt)
      }
      if (attachedRecordId) {
        setActiveImageId((current) => current || attachedRecordId)
        setDefaultImageId((current) => current || attachedRecordId)
      }
      if (isFetchingRef.current) {
        needsRefetchRef.current = true
        return
      }
      isFetchingRef.current = true
      needsRefetchRef.current = false
      void syncUploadedImages().finally(() => {
        isFetchingRef.current = false
        if (needsRefetchRef.current) {
          needsRefetchRef.current = false
          void syncUploadedImages()
        }
      })
    }
    return subscribeToUploadComplete(handleUploadComplete)
  }, [draftId, registerDraftUpdatedAt, subscribeToUploadComplete, syncUploadedImages])

  // Polling fallback: periodically refetch when draft has images still processing.
  // This catches cases where subscriber events are missed or the worker completes
  // after all upload callbacks have fired.
  const hasProcessingImages = useMemo(() => {
    if (!draft) return false
    return draft.images.some((image) => image.readiness_status === 'processing')
  }, [draft])

  useEffect(() => {
    if (!hasProcessingImages || !draftId) return
    // Only poll when no uploads are actively firing subscriber callbacks
    const hasActiveUploads = pendingDraftUploads.some(
      (upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING'
    )
    if (hasActiveUploads) return

    const timer = window.setInterval(() => {
      void loadDraft()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [hasProcessingImages, draftId, pendingDraftUploads, loadDraft])

  useEffect(() => {
    if (!cragId || activeImageId || canvasSource?.kind === 'draft-image') return
    const firstReadyCragImage = cragCanvasImages.find((image) => image.signed_url) || null
    if (!firstReadyCragImage?.id) return
    setActiveImageId(firstReadyCragImage.id)
    setCanvasSource({ kind: 'crag-image', cragImageId: firstReadyCragImage.id, cragId })
  }, [activeImageId, canvasSource, cragCanvasImages, cragId])

  const activeImageTab = useMemo(() => {
    if (!activeImageId) return null
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    return sourceImages.find((image) => image.imageId === activeImageId) || null
  }, [activeImageId, canvasSource, mergedCragCanvasImages, mergedManageImages])
  const activeDraftImageId = activeImageTab?.imageId || null
  const activeImageLocationMode = activeDraftImageId ? (resolveLocationMode(locationModeByImageId[activeDraftImageId])) : 'shared'

  const activeRoutes = useMemo(() => {
    if (!activeDraftImageId) return []
    return routesByImageId[activeDraftImageId] || []
  }, [activeDraftImageId, routesByImageId])

  const existingRouteLines = useMemo(() => {
    return activeRoutes.map((route) => ({
      id: route.id,
      image_id: activeDraftImageId || 'draft-image',
      climb_id: route.id,
      points: route.points,
      color: 'red',
      sequence_order: route.sequenceOrder,
      image_width: route.imageWidth,
      image_height: route.imageHeight,
      created_at: 'draft-hydrated',
      climb: {
        id: route.id,
        name: route.name,
        grade: route.grade,
        status: 'draft',
        route_type: route.climbType || routeType,
        description: route.description || null,
      },
    } as RouteLine))
  }, [activeRoutes, activeDraftImageId, routeType])

  const imageSelection = useMemo<ImageSelection | null>(() => {
    if (!activeImageTab) return null
    if (activeImageTab.sourceKind === 'crag-image') {
      const selectedCragImage = cragCanvasImages.find((image) => image.id === activeImageTab.imageId) || null
      return {
        mode: 'crag-image',
        cragImageId: activeImageTab.imageId,
        imageUrl: buildHighResCanvasUrl(activeImageTab.signedUrl),
        linkedImageId: selectedCragImage?.linked_image_id || null,
        width: selectedCragImage?.width || null,
        height: selectedCragImage?.height || null,
      }
    }
    return {
      mode: 'existing',
      imageId: activeImageTab.imageId,
      imageUrl: buildHighResCanvasUrl(activeImageTab.signedUrl),
    }
  }, [activeImageTab, cragCanvasImages])

  const stableActiveImageUrl = useMemo(() => {
    if (!imageSelection || !('imageUrl' in imageSelection)) {
      stableCanvasUrlRef.current = { imageId: null, imageUrl: '' }
      return ''
    }

    const nextImageId = imageSelection.mode === 'crag-image'
      ? imageSelection.cragImageId
      : imageSelection.imageId

    if (stableCanvasUrlRef.current.imageId === nextImageId && stableCanvasUrlRef.current.imageUrl === imageSelection.imageUrl) {
      return stableCanvasUrlRef.current.imageUrl
    }

    stableCanvasUrlRef.current = {
      imageId: nextImageId,
      imageUrl: imageSelection.imageUrl,
    }
    return imageSelection.imageUrl
  }, [imageSelection])

  useEffect(() => {
    if (!imageSelection || !('imageUrl' in imageSelection)) return
    uploadDebug('editor-active-image-url', {
      activeImageId,
      imageUrl: imageSelection.imageUrl,
      sourceKind: activeImageTab?.sourceKind || null,
      status: activeImageTab?.status || null,
    })
  }, [activeImageId, activeImageTab?.sourceKind, activeImageTab?.status, imageSelection])

  const activeImageReady = Boolean(activeImageTab?.signedUrl) && activeImageTab?.status !== 'FAILED'

  const activeImageCustomPosition = useMemo<[number, number] | null>(() => {
    if (!activeDraftImageId || activeImageLocationMode !== 'custom') return null
    const gps = customGpsByImageId[activeDraftImageId]
    if (!gps || !isValidLocationCoordinate(gps.latitude, gps.longitude)) return null
    return [gps.latitude as number, gps.longitude as number]
  }, [activeDraftImageId, activeImageLocationMode, customGpsByImageId])

  const effectiveMarkerPosition = activeImageCustomPosition || markerPosition
  const hasValidLocation = effectiveMarkerPosition !== null

  const defaultImageTab = useMemo(() => {
    if (!defaultImageId) return null
    return mergedManageImages.find((image) => image.imageId === defaultImageId) || null
  }, [defaultImageId, mergedManageImages])
  const defaultImageRoutes = useMemo(() => {
    if (!defaultImageId) return []
    return routesByImageId[defaultImageId] || []
  }, [defaultImageId, routesByImageId])

  const publishValidationMessage = useMemo(() => {
    const missingItems: string[] = []

    if (draftId && hasPendingUploads(draftId)) {
      missingItems.push('wait for photo uploads to finish')
    }

    if (draftId && hasFailedUploads(draftId)) {
      missingItems.push('retry or delete failed photo uploads')
    }

    if (!cragId) {
      missingItems.push('select a crag')
    }

    if (!hasValidLocation) {
      missingItems.push('add climb location')
    }

    if (!defaultImageTab || defaultImageRoutes.length === 0) {
      missingItems.push(`draw at least one route on ${defaultImageTab?.label || 'the default image'}`)
    }

    return missingItems.length > 0
      ? `Before publishing, ${missingItems.join(', ')}.`
      : null
  }, [cragId, defaultImageRoutes.length, defaultImageTab, draftId, hasFailedUploads, hasPendingUploads, hasValidLocation])

  const quickSwitcherImages = useMemo(() => {
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    const pendingUploads = canvasSource?.kind === 'crag-image' ? pendingCragUploads : pendingDraftUploads

    return sourceImages
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((image: ManageImageTab) => ({
        ...image,
        badgeNumber: image.index + 1,
        isDefault: image.sourceKind === 'draft-image' && image.imageId === defaultImageId,
        progress: image.pendingClientId ? (pendingUploads.find((upload) => upload.clientId === image.pendingClientId)?.progress || 0) : undefined,
      }))
  }, [canvasSource, defaultImageId, mergedCragCanvasImages, mergedManageImages, pendingCragUploads, pendingDraftUploads])

  const draftMapPins = useMemo<LightweightCragMapPin[]>(() => {
    return buildMapPins(quickSwitcherImages.map((image) => ({
      imageId: image.imageId,
      order: image.badgeNumber - 1,
      label: image.label,
      latitude: image.latitude,
      longitude: image.longitude,
      locationMode: resolveLocationMode(image.locationMode),
    }))).map((pin) => {
      const sourceImage = quickSwitcherImages.find((image) => image.imageId === pin.id)
      return {
        ...pin,
        tone: sourceImage?.sourceKind === 'crag-image' ? 'published' : 'draft',
      }
    })
  }, [quickSwitcherImages])

  const fallbackLocation = useMemo<[number, number] | null>(() => {
    const firstImagePin = draftMapPins.find((pin) => isValidLocationCoordinate(pin.latitude, pin.longitude)) || null
    if (firstImagePin) {
      return [firstImagePin.latitude, firstImagePin.longitude as number]
    }

    if (selectedCrag && isValidLocationCoordinate(selectedCrag.latitude, selectedCrag.longitude)) {
      return [selectedCrag.latitude, selectedCrag.longitude as number]
    }

    return null
  }, [draftMapPins, selectedCrag])

  const publishedMapPins = useMemo<LightweightCragMapPin[]>(() => {
    const draftCoordinateKeys = new Set(
      quickSwitcherImages
        .filter((image: ManageImageTab & { badgeNumber: number; isDefault: boolean }) => typeof image.latitude === 'number' && typeof image.longitude === 'number')
        .map((image: ManageImageTab & { badgeNumber: number; isDefault: boolean }) => coordinateKey(image.latitude as number, image.longitude as number))
    )
    const seenPublishedCoordinates = new Set<string>()

    return publishedCragPins.reduce<LightweightCragMapPin[]>((acc, image) => {
      const key = coordinateKey(image.latitude, image.longitude)
      if (draftCoordinateKeys.has(key) || seenPublishedCoordinates.has(key)) return acc
      seenPublishedCoordinates.add(key)
      acc.push({
        id: `published-${image.id}`,
        latitude: image.latitude,
        longitude: image.longitude,
        interactive: false,
        tone: 'published',
      })
      return acc
    }, [])
  }, [publishedCragPins, quickSwitcherImages])

  useEffect(() => {
    if (!activeImageId) return
    const activeQuickSwitchImage = quickSwitcherImages.find((image) => image.imageId === activeImageId) || null
      const latitude = activeImageCustomPosition?.[0] ?? activeQuickSwitchImage?.latitude ?? null
      const longitude = activeImageCustomPosition?.[1] ?? activeQuickSwitchImage?.longitude ?? null
    if (latitude === null && longitude === null) return
    uploadDebug('editor-active-image-map-data', {
      activeImageId,
      hasQuickSwitchImage: Boolean(activeQuickSwitchImage),
      latitude,
      longitude,
    })
  }, [activeImageCustomPosition, activeImageId, quickSwitcherImages])

  useEffect(() => {
    setMode('edit-existing')
    setInteractionTool('draw')
    return () => {
      reset()
    }
  }, [setMode, setInteractionTool, reset])

  useEffect(() => {
    const previousActiveImageId = previousActiveImageIdRef.current

    if (previousActiveImageId && activeImageId && previousActiveImageId !== activeImageId) {
      clearCanvasState()
    }

    previousActiveImageIdRef.current = activeImageId
  }, [activeImageId, clearCanvasState])

  useEffect(() => {
    if (!draft || isInitialLoading) return
    hasHydratedLocationRef.current = true
  }, [draft, isInitialLoading])

  useEffect(() => {
    if (!hasHydratedLocationRef.current) return
    if (effectiveMarkerPosition || !fallbackLocation) return

    setLatitude(formatCoordinate(fallbackLocation[0]))
    setLongitude(formatCoordinate(fallbackLocation[1]))
  }, [effectiveMarkerPosition, fallbackLocation, setLatitude, setLongitude])

  useEffect(() => {
    if (!hasHydratedLocationRef.current || !draftId || !draftUpdatedAt || !effectiveMarkerPosition || imagesPayload.length === 0) return

    const latitudeValue = effectiveMarkerPosition[0]
    const longitudeValue = effectiveMarkerPosition[1]
    const nextCragId = cragId ?? nearbyCragId
    const signature = JSON.stringify({
      latitude: latitudeValue,
      longitude: longitudeValue,
      countryId: atlasCountryId,
      countryCode: atlasCountryCode,
      countryName: atlasCountryName,
      adminRegionName: atlasAdminRegionName,
      unRegionName: atlasUnRegionName,
      continentName: atlasContinentName,
      cragId: nextCragId,
    })

    if (signature === lastLocationSyncRef.current) return

    const timer = window.setTimeout(async () => {
      lastLocationSyncRef.current = signature
      const atlasForPatch = atlasSync.atlas

      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: draftUpdatedAt,
          images: imagesPayload,
          metadata: {
            submission: {
              routeType,
              isAnonymousSubmission,
              contributionCreditPlatform: creditPlatform,
              contributionCreditHandle: creditHandle,
              location: {
                latitude: latitudeValue,
                longitude: longitudeValue,
                countryId: atlasForPatch?.countryId ?? null,
                countryCode: atlasForPatch?.countryCode ?? null,
                countryName: atlasForPatch?.countryName ?? null,
                adminRegionName: atlasForPatch?.adminRegionName ?? null,
                unRegionName: atlasForPatch?.unRegionName ?? null,
                continentName: atlasForPatch?.continentName ?? null,
              },
            },
          },
          cragId: nextCragId,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload?.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      } else {
        lastLocationSyncRef.current = null
      }
      if (!cragId && nearbyCragId) {
        setCragId(nearbyCragId)
        setSelectedCrag((current) => current || {
          id: nearbyCragId,
          name: nearbyCragName || 'Suggested crag',
          latitude: latitudeValue ?? 0,
          longitude: longitudeValue ?? 0,
        })
      }
    }, 400)

    return () => window.clearTimeout(timer)
  // draftUpdatedAt and atlasSync.atlas are intentionally read at execution time
  // to avoid retriggering this sync effect after a successful PATCH.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasAdminRegionName, atlasContinentName, atlasCountryCode, atlasCountryId, atlasCountryName, atlasUnRegionName, cragId, draft, draftId, effectiveMarkerPosition, imagesPayload.length, imagesPayloadSignature, isInitialLoading, nearbyCragId, nearbyCragName])

  const toggleImageOrientation = useCallback((direction: FaceDirection) => {
    if (!activeDraftImageId) return
    setOrientationByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const next = current.includes(direction)
        ? current.filter((value) => value !== direction)
        : [...current, direction]
      return {
        ...prev,
        [activeDraftImageId]: sortFaceDirections(next),
      }
    })
  }, [activeDraftImageId])

  const focusDrawingArea = useCallback((behavior: ScrollBehavior = 'smooth') => {
    drawingAreaRef.current?.scrollIntoView({ behavior, block: 'start' })
  }, [])

  const handleQuickSwitchImage = useCallback((imageId: string) => {
    const targetImage = quickSwitcherImages.find((image) => image.imageId === imageId) || null
    setActiveImageId(imageId)
    if (targetImage?.sourceKind === 'crag-image' && cragId) {
      setCanvasSource({ kind: 'crag-image', cragImageId: imageId, cragId })
    } else {
      setCanvasSource({ kind: 'draft-image', draftImageId: imageId })
    }
    window.setTimeout(() => {
      focusDrawingArea('smooth')
    }, 0)
  }, [cragId, focusDrawingArea, quickSwitcherImages])

  const handleAddImages = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !draftId || !draftUpdatedAt || addingImages) return

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
      .slice(0, 20)
    if (files.length === 0) {
      setError('Select at least one image file')
      return
    }

    setAddingImages(true)
    setError(null)
    setSuccess(null)

    try {
      queueDraftUploads(files, draftId)
      setSuccess(`Added ${files.length} image${files.length === 1 ? '' : 's'} to draft`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add images')
    } finally {
      setAddingImages(false)
      if (addImageInputRef.current) {
        addImageInputRef.current.value = ''
      }
    }
  }, [addingImages, draftId, draftUpdatedAt, queueDraftUploads])

  const handleQuickBarDropFiles = useCallback((files: File[]) => {
    const fileListLike: { length: number; item: (index: number) => File | null; [key: number]: File } = {
      length: files.length,
      item: (index: number) => files[index] || null,
    }
    files.forEach((file, index) => {
      fileListLike[index] = file
    })
    void handleAddImages(fileListLike as unknown as FileList)
  }, [handleAddImages])

  const handleRemoveImage = useCallback(async (imageId: string) => {
    const pendingUpload = pendingDraftUploads.find((upload) => upload.clientId === imageId) || null
    if (pendingUpload) {
      setError(null)
      setSuccess(null)
      await removeUpload(pendingUpload.clientId)
      if (activeImageId === pendingUpload.clientId) {
        const fallbackImageId = mergedManageImages.find((image) => image.imageId !== pendingUpload.clientId)?.imageId || null
        setActiveImageId(fallbackImageId)
      }
      setSuccess('Image removed from draft')
      return
    }

    if (!draft || !draftUpdatedAt || removingImageId) return
    if (draft.images.length <= 1) {
      setError('A draft must keep at least one image')
      return
    }

    setRemovingImageId(imageId)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/images/${imageId}?expected_updated_at=${encodeURIComponent(draftUpdatedAt)}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({} as DraftDeleteImageResponse & DraftConflictResponse & { error?: string }))

      if (!response.ok) {
        if (response.status === 409 && (payload as DraftConflictResponse).code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          setConflict({
            serverUpdatedAt: conflictPayload.current_updated_at,
            lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: {
              images: [],
              metadata: {},
              cragId,
            },
          })
          return
        }

        throw new Error((payload as { error?: string }).error || 'Failed to remove image')
      }

      const remainingImages = draft.images
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .filter((image) => image.id !== imageId)
      const fallbackImageId = remainingImages[0]?.id || null

      if (defaultImageId === imageId) {
        setDefaultImageId(fallbackImageId)
      }

      if (activeImageId === imageId) {
        setActiveImageId(defaultImageId && defaultImageId !== imageId ? defaultImageId : fallbackImageId)
      }

      setOrientationByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })
      setRoutesByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })

      await loadDraft()
      if (payload.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      }
      setSuccess('Image removed from draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setRemovingImageId(null)
    }
  }, [activeImageId, cragId, defaultImageId, draft, draftUpdatedAt, loadDraft, mergedManageImages, pendingDraftUploads, removeUpload, removingImageId, setConflict])

  const handleDeleteDraft = useCallback(async () => {
    if (!draftId || !isOwner) return

    setError(null)
    const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({} as { error?: string }))
    if (!response.ok) {
      setError(payload.error || 'Failed to delete draft')
      return
    }

    addToast('Draft deleted', 'success')
    router.push('/logbook')
  }, [draftId, isOwner, addToast, router])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    if (activeDraftImageId && activeImageLocationMode === 'custom') {
      setCustomGpsByImageId((prev) => ({
        ...prev,
        [activeDraftImageId]: {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        },
      }))
      return
    }
    updateDraftLocation(event.latlng.lat, event.latlng.lng)
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation])

  const handleMarkerDragEnd = useCallback((event: L.LeafletEvent) => {
    const marker = event.target as L.Marker
    const position = marker.getLatLng()
    if (activeDraftImageId && activeImageLocationMode === 'custom') {
      setCustomGpsByImageId((prev) => ({
        ...prev,
        [activeDraftImageId]: {
          latitude: position.lat,
          longitude: position.lng,
        },
      }))
      return
    }
    updateDraftLocation(position.lat, position.lng)
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation])

  const handleSearchLocation = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    setSearchingLocation(true)
    setLocationSearchError(null)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`)
      const payload = await response.json().catch(() => ({} as { results?: Array<{ lat?: string; lon?: string }> }))
      const firstResult = Array.isArray(payload.results) ? payload.results[0] : null

      if (!response.ok || !firstResult?.lat || !firstResult?.lon) {
        throw new Error('No location found')
      }

      const lat = Number(firstResult.lat)
      const lng = Number(firstResult.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Invalid location coordinates')
      }

      updateDraftLocation(lat, lng)
      setMapOpen(true)
    } catch (err) {
      setLocationSearchError(err instanceof Error ? err.message : 'Failed to search location')
    } finally {
      setSearchingLocation(false)
    }
  }, [searchQuery, setMapOpen, setSearchingLocation, updateDraftLocation])

  const saveDraft = useCallback(async (options?: { silent?: boolean; overrideRoutesByImageId?: Record<string, DraftRoute[]> }) => {
    const silent = options?.silent === true
    const resolvedRoutesByImageId = options?.overrideRoutesByImageId ?? routesByImageId
    if (!draft || !draftUpdatedAt) return false

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setSavingDraft(true)
    if (silent) {
      setAutosaveState('saving')
    } else {
      setError(null)
      setSuccess(null)
    }

    try {
      const nextImagesPayload = buildRouteCompletionPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages.map((image) => image.imageId))
      const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
      if (creditHandle.trim().length > 0 && !normalizedHandle) {
        throw new Error('Invalid credit handle format')
      }

          const fullV2Metadata = serializeDraftMetadataV2({
            version: 2,
            navigation: {
              defaultImageId,
            },
            images: nextImagesPayload.reduce<Record<string, { imageId: string; displayOrder: number; orientation?: OrientationDirection[]; locationMode: 'shared' | 'custom'; gps: { latitude: number | null; longitude: number | null } }>>((acc, image) => {
              acc[image.id] = {
                imageId: image.id,
                displayOrder: image.display_order,
                orientation: orientationByImageId[image.id] || [],
                locationMode: locationModeByImageId[image.id] === 'custom' ? 'custom' : 'shared',
                gps: {
                  latitude: customGpsByImageId[image.id]?.latitude ?? null,
                  longitude: customGpsByImageId[image.id]?.longitude ?? null,
                },
              }
              return acc
            }, {}),
            submission: {
              routeType,
              location: {
                latitude: markerPosition ? markerPosition[0] : null,
                longitude: markerPosition ? markerPosition[1] : null,
              },
              isAnonymousSubmission,
              contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
              contributionCreditHandle: normalizedHandle,
              sectorId,
              canvasSource: canvasSource?.kind === 'crag-image'
                ? {
                    kind: 'crag-image',
                    cragImageId: canvasSource.cragImageId,
                    cragId: canvasSource.cragId,
                  }
                : canvasSource?.kind === 'draft-image'
                  ? {
                      kind: 'draft-image',
                      draftImageId: canvasSource.draftImageId,
                    }
                  : null,
            },
          })

          const savePayload: DraftSavePayload = {
            images: nextImagesPayload,
            cragId,
            metadata: fullV2Metadata as unknown as Record<string, unknown>,
          }

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...savePayload,
          expected_updated_at: draftUpdatedAt,
        }),
      })

      const payload = await response.json().catch(() => ({} as {
        error?: string
        code?: string
        message?: string
        draft?: { updated_at?: string }
        current_updated_at?: string
        current_data?: { last_updated_by?: string | null; last_updated_by_display_name?: string | null }
      }))

      if (!response.ok) {
        if (response.status === 409 && payload.code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          const isSelfConflict = conflictPayload.current_data?.last_updated_by === currentUserId
          if (silent || isSelfConflict) {
            setDraftUpdatedAt(conflictPayload.current_updated_at)
            if (silent) {
              setAutosaveState('syncing')
              if (!isSelfConflict) {
              autosavePausedRef.current = true
              autosavePausedSnapshotRef.current = buildRouteWorkflowSignature({
                imagesPayloadSignature: JSON.stringify(buildRouteCompletionPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages.map((image) => image.imageId))),
                defaultImageId,
                routeType,
                markerLatitude: markerPosition ? markerPosition[0] : null,
                markerLongitude: markerPosition ? markerPosition[1] : null,
                cragId,
                isAnonymousSubmission,
                creditPlatform,
                creditHandle: normalizedHandle,
                sectorId,
                canvasSource,
                orientationByImageId,
                locationModeByImageId,
                customGpsByImageId,
              })
              }
            } else {
              setAutosaveState('idle')
            }
            return false
          }
          setConflict({
            serverUpdatedAt: conflictPayload.current_updated_at,
            lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: savePayload,
          })
          return false
        }
        throw new Error(payload.error || 'Failed to save draft')
      }

      setDraft((prev) => prev ? {
        ...prev,
        updated_at: payload.draft?.updated_at || prev.updated_at,
        last_edited_by: currentUserId,
        metadata: {
          ...fullV2Metadata,
        },
      } : prev)
      setDraftUpdatedAt(payload.draft?.updated_at || new Date().toISOString())
      lastPersistedRoutesRef.current = buildRouteWorkflowSignature({
        imagesPayloadSignature: JSON.stringify(savePayload.images),
        defaultImageId,
        routeType,
        markerLatitude: markerPosition ? markerPosition[0] : null,
        markerLongitude: markerPosition ? markerPosition[1] : null,
        cragId,
        isAnonymousSubmission,
        creditPlatform,
        creditHandle: normalizedHandle,
        sectorId,
        canvasSource,
        orientationByImageId,
        locationModeByImageId,
        customGpsByImageId,
      })
      setConflict(null)
      if (silent) {
        setAutosaveState('saved')
      } else {
        setAutosaveState('idle')
        setSuccess('Draft saved. Not published to the map.')
      }
      return true
    } catch (saveError) {
      setAutosaveState('idle')
      if (!silent) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      }
      return false
    } finally {
      setSavingDraft(false)
    }
  }, [canvasSource, cragId, creditHandle, creditPlatform, currentUserId, customGpsByImageId, defaultImageId, draft, draftUpdatedAt, isAnonymousSubmission, locationModeByImageId, manageImages, markerPosition, orientationByImageId, routeType, routesByImageId, sectorId, setConflict])

  const scheduleDraftPersist = useCallback((nextRoutesByImageId: Record<string, DraftRoute[]>) => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId || !activeDraftImageId) return

    const currentImageRoutes = nextRoutesByImageId[activeDraftImageId] || []
    setAutosaveState('saving')
    void csrfFetch(`/api/submissions/drafts/${currentDraftId}/routes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftImageId: activeDraftImageId,
        routes: currentImageRoutes.map((route, index) => ({
          id: route.id,
          name: route.name,
          grade: route.grade,
          description: route.description,
          climbType: route.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: route.imageWidth,
          imageHeight: route.imageHeight,
        })),
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({} as { result?: { updated_at?: string } }))
        if (!response.ok) {
          throw new Error('Failed to sync draft routes')
        }
        const nextUpdatedAt = payload.result?.updated_at
        if (typeof nextUpdatedAt === 'string' && nextUpdatedAt) {
          setDraftUpdatedAt(nextUpdatedAt)
          registerDraftUpdatedAt(currentDraftId, nextUpdatedAt)
        }
        setAutosaveState('saved')
      })
      .catch(() => {
        setAutosaveState('idle')
      })
  }, [activeDraftImageId, registerDraftUpdatedAt, routeType])

  const persistMetadataImmediately = useCallback((applyChange: () => void) => {
    applyChange()

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setAutosaveState('saving')
    window.setTimeout(() => {
      void saveDraft({ silent: true })
    }, 0)
  }, [saveDraft])

  const setActiveAsDefault = useCallback(() => {
    if (!activeImageTab || activeImageTab.sourceKind !== 'draft-image') return
    persistMetadataImmediately(() => {
      setDefaultImageId(activeImageTab.imageId)
      setCanvasSource({ kind: 'draft-image', draftImageId: activeImageTab.imageId })
    })
  }, [activeImageTab, persistMetadataImmediately])

  const handleEditRoutesUpdate = useCallback((routes: EditableRoute[]) => {
    if (!activeDraftImageId) return
    setRoutesByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const previousById = new Map(current.map((route) => [route.id, route]))
      const mapped = routes.map((route, index) => {
        const previous = previousById.get(route.id)
        return {
          id: route.id,
          name: route.name,
          grade: route.grade || previous?.grade || '6A',
          description: route.description,
          climbType: route.climbType || previous?.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: previous?.imageWidth || 1200,
          imageHeight: previous?.imageHeight || 1200,
        }
      })

      if (areSerializedRoutesEqual(current, mapped)) return prev

      const nextRoutesByImageId = {
        ...prev,
        [activeDraftImageId]: mapped,
      }

      scheduleDraftPersist(nextRoutesByImageId)
      return nextRoutesByImageId
    })
  }, [activeDraftImageId, routeType, scheduleDraftPersist])

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    setRouteStoreRoutes(routes)
    const editableRoutes = routes.map((route) => ({
      id: route.id,
      name: route.climb?.name || 'Unnamed',
      grade: route.climb?.grade || '6A',
      climbType: typeof route.climb?.route_type === 'string' ? route.climb.route_type : undefined,
      description: route.climb?.description ?? undefined,
      points: route.points,
    }))
    handleEditRoutesUpdate(editableRoutes)
  }, [handleEditRoutesUpdate, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededRouteImageIdRef.current === activeDraftImageId) return

    lastSeededRouteImageIdRef.current = activeDraftImageId
    if (haveStoredRoutesChanged(routeStoreRoutes, existingRouteLines)) {
      skipRouteStoreSyncRef.current = activeDraftImageId
      setRouteStoreRoutes(existingRouteLines)
    }
  }, [activeDraftImageId, existingRouteLines, routeStoreRoutes, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (skipRouteStoreSyncRef.current === activeDraftImageId) {
      skipRouteStoreSyncRef.current = null
      return
    }
    if (!haveStoredRoutesChanged(routeStoreRoutes, existingRouteLines)) return
    handleCanvasRoutesUpdate(routeStoreRoutes)
  }, [activeDraftImageId, existingRouteLines, handleCanvasRoutesUpdate, routeStoreRoutes])

  const handleManualSave = useCallback(() => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }
    void saveDraft()
  }, [saveDraft])

  useEffect(() => {
    if (!hasLoadedRoutesRef.current) return
    if (!draft || !draftUpdatedAt) return
    if (isInitialLoading || publishingDraft || savingDraft || !!conflict) return
    if (hasInFlightDraftUploads) return

    if (autosavePausedRef.current) {
      if (autosaveSignature === autosavePausedSnapshotRef.current) {
        return
      }
      autosavePausedRef.current = false
      autosavePausedSnapshotRef.current = ''
    }

    if (autosaveSignature === lastPersistedRoutesRef.current) {
      if (autosaveState === 'pending' || autosaveState === 'syncing') {
        setAutosaveState('idle')
      }
      return
    }

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    setAutosaveState('pending')
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null
      void saveDraft({ silent: true })
    }, 1000)

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [autosaveSignature, autosaveState, conflict, draft, draftUpdatedAt, hasInFlightDraftUploads, isInitialLoading, publishingDraft, saveDraft, savingDraft])

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [])

  const publishDraft = useCallback(async () => {
    if (!draft || !isOwner) return

    if (publishValidationMessage) {
      setPublishAttempted(true)
      setError(null)

      if (!cragId) {
        cragSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (!hasValidLocation) {
        locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (!defaultImageTab || defaultImageRoutes.length === 0) {
        if (defaultImageTab) {
          setActiveImageId(defaultImageTab.imageId)
        }
        publishRequirementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    setPublishAttempted(false)

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setPublishingDraft(true)
    setError(null)

    try {
      const saved = await saveDraft()
      if (!saved) return

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/promote`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({} as {
        error?: string
        published?: {
          imageId?: string
          defaultImageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
          canonicalPath?: string
          defaultRouteId?: string | null
        }
      }))

      if (!response.ok || !payload.published?.defaultImageId || !payload.published.canonicalPath) {
        throw new Error(payload.error || 'Failed to publish draft')
      }

      const imageCount = Array.isArray(payload.published.imageIds) ? payload.published.imageIds.length : 1
      const routeCount = Array.isArray(payload.published.routeLineIds) ? payload.published.routeLineIds.length : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} image${imageCount === 1 ? '' : 's'}.`, 'success')

      const query = new URLSearchParams({
        publishedImages: String(imageCount),
        publishedRoutes: String(routeCount),
      })
      if (payload.published.defaultRouteId) {
        query.set('route', payload.published.defaultRouteId)
      }
      router.push(`${payload.published.canonicalPath}?${query.toString()}`)
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : 'Failed to publish draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setPublishingDraft(false)
    }
  }, [addToast, cragId, defaultImageRoutes.length, defaultImageTab, draft, hasValidLocation, isOwner, publishValidationMessage, router, saveDraft])

  const handleReloadLatestDraft = useCallback(async () => {
    setConflict(null)
    setSuccess(null)
    await loadDraft()
    await loadCollaborators()
  }, [loadDraft, loadCollaborators, setConflict])

  const handleCopyUnsavedEdits = useCallback(async () => {
    if (!conflict) return

    const textPayload = JSON.stringify(conflict.pendingChanges, null, 2)
    try {
      await navigator.clipboard.writeText(textPayload)
      addToast('Unsaved edits copied', 'success')
    } catch {
      setError('Failed to copy unsaved edits')
    }
  }, [conflict, addToast])

  if (isInitialLoading && !draft) {
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
        <DraftToolbar
          savingDraft={savingDraft}
          publishingDraft={publishingDraft}
          hasConflict={!!conflict}
          isOwner={isOwner}
          draftId={draftId}
          hasPendingUploads={hasPendingUploads}
          hasFailedUploads={hasFailedUploads}
          onManualSave={handleManualSave}
          onPublish={() => { void publishDraft() }}
          onDeleteDraft={() => { void handleDeleteDraft() }}
          autosaveState={autosaveState}
        />

        {collaborationAdded ? (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit this draft.
          </div>
        ) : null}

        {publishAttempted && publishValidationMessage ? (
          <div ref={publishRequirementsRef} className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {publishValidationMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!error && draft && manageImages.length === 0 ? (
          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {pendingDraftUploads.length > 0 || draft.images.some((image) => image.readiness_status === 'processing')
              ? 'Photos are still preparing for the editor. They should appear here once image access is ready.'
              : draft.images.length > 0 && draft.images.every((image) => image.readiness_status === 'error')
                ? 'Some photos failed to prepare for the editor. Try re-uploading the affected images.'
                : draft.images.length === 0 && pendingDraftUploads.length === 0
                  ? 'This draft has no photos yet. Add at least one image to continue.'
                  : 'Photos are still preparing for the editor. They should appear here once image access is ready.'}
          </div>
        ) : null}

        {success ? (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        ) : null}

        <DraftUploadQueue
          pendingDraftUploads={pendingDraftUploads}
          queuePaused={queuePaused}
          draftId={draftId}
          hasPendingUploads={hasPendingUploads}
          hasFailedUploads={hasFailedUploads}
          onRetryUpload={retryUpload}
          onRemoveUpload={(clientId) => { void removeUpload(clientId) }}
          onResumeQueue={resumeQueue}
        />

        <input
          ref={addImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleAddImages(event.target.files)
          }}
        />

        {imageSelection && 'imageUrl' in imageSelection ? (
          <SubmissionWorkstation
            drawingAreaRef={drawingAreaRef}
            routeCanvasRef={routeCanvasRef}
            quickSwitcherImages={quickSwitcherImages}
            activeImageId={activeImageId}
            activeImageUrl={stableActiveImageUrl}
            activeImageReady={activeImageReady}
            activeImageStatus={activeImageTab?.status}
            onRetryActiveImage={activeImageTab?.status === 'FAILED' ? () => retryUpload(activeImageTab.imageId) : undefined}
            onDeleteActiveImage={activeImageTab?.status === 'FAILED' ? () => { void handleRemoveImage(activeImageTab.imageId) } : undefined}
            draftPins={draftMapPins}
            publishedPins={publishedMapPins}
            initialCenter={markerPosition}
            hideRouteActions={mapOpen}
            onSelectImage={handleQuickSwitchImage}
            onReorderImages={(imageIds) => {
              setManageImages((prev) => reorderItemsByIds(prev, imageIds).map((image) => ({
                ...image,
                locationMode: resolveLocationMode(locationModeByImageId[image.imageId] || image.locationMode),
              })))
            }}
            existingRouteLines={existingRouteLines}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(routeId) => {
              setSelectedRoute(routeId)
              setActiveRoute(routeId)
              setEditorPanelOpen(true)
            }}
            onReorderRoutes={(routeIds) => {
              if (!activeDraftImageId) return
              setRoutesByImageId((prev) => {
                const current = prev[activeDraftImageId] || []
                const nextRoutes = resequenceRoutes(current, routeIds)
                const nextRoutesByImageId = {
                  ...prev,
                  [activeDraftImageId]: nextRoutes,
                }
                skipRouteStoreSyncRef.current = activeDraftImageId
                setRouteStoreRoutes(resequenceRoutes(existingRouteLines, routeIds) as RouteLine[])
                scheduleDraftPersist(nextRoutesByImageId)
                return nextRoutesByImageId
              })
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
            canvasKey={activeImageTab?.imageId || 'draft-canvas'}
            defaultClimbType={resolveDraftClimbType(routeType)}
            extraAction={activeImageTab ? (
              <button
                type="button"
                onClick={setActiveAsDefault}
                disabled={!activeImageReady}
                className="inline-flex h-9 items-center rounded-xl border border-blue-200 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                Default
              </button>
            ) : null}
            addAction={{ loading: addingImages, disabled: !!conflict, onClick: () => addImageInputRef.current?.click() }}
            removeAction={activeImageTab ? {
              loading: removingImageId === activeImageTab.imageId,
              disabled: quickSwitcherImages.length <= 1 || !!conflict,
              onClick: () => { void handleRemoveImage(activeImageTab.imageId) },
            } : undefined}
            onQuickBarDropFiles={handleQuickBarDropFiles}
            onRoutesUpdate={handleCanvasRoutesUpdate}
          />
        ) : null}

        <DraftMetadataPanel
          atlasSync={atlasSync}
          selectedCrag={selectedCrag}
          showCragSelector={showCragSelector}
          cragId={cragId}
          sectorId={sectorId}
          activeImageLocationMode={activeImageLocationMode}
          activeDraftImageId={activeDraftImageId}
          latitude={latitude}
          longitude={longitude}
          customGpsByImageId={customGpsByImageId}
          effectiveMarkerPosition={effectiveMarkerPosition}
          mapOpen={mapOpen}
          leaflet={leaflet}
          searchQuery={searchQuery}
          searchingLocation={searchingLocation}
          locationSearchError={locationSearchError}
          routeType={routeType}
          onShowCragSelector={setShowCragSelector}
          onSelectCrag={(crag) => {
            setCragId(crag.id)
            setSelectedCrag(crag)
            setCragCanvasImages([])
            setShowCragSelector(false)
            setSuccess('Crag selected for this draft.')
            void saveDraft({ silent: true })
          }}
          onCreateCrag={(crag) => {
            setCragId(crag.id)
            setSelectedCrag(crag)
            setCragCanvasImages([])
            setCanvasSource(null)
            setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
            setShowCragSelector(false)
            void saveDraft({ silent: true })
          }}
          onSectorChange={setSectorId}
          onLocationModeChange={(mode) => {
            if (!activeDraftImageId) return
            if (mode === 'shared') {
              setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'shared' }))
              setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'shared' } : image))
            } else {
              setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'custom' }))
              setCustomGpsByImageId((prev) => ({
                ...prev,
                [activeDraftImageId]: prev[activeDraftImageId] || {
                  latitude: markerPosition?.[0] ?? null,
                  longitude: markerPosition?.[1] ?? null,
                },
              }))
              setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'custom' } : image))
            }
          }}
          onLatitudeChange={setLatitude}
          onLongitudeChange={setLongitude}
          onCustomGpsChange={(imageId, gps) => {
            setCustomGpsByImageId((prev) => ({ ...prev, [imageId]: gps }))
          }}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
          onMapOpenChange={(open) => {
            if (open) {
              setMapOpen(true)
            } else {
              void saveDraft({ silent: true }).then(() => setMapOpen(false))
            }
          }}
          onSearchQueryChange={setSearchQuery}
          onSearchLocation={handleSearchLocation}
          onRouteTypeChange={(nextRouteType) => {
            persistMetadataImmediately(() => {
              setRouteType(nextRouteType)
            })
          }}
        />

        <DraftDetailsPanel
          detailsOpen={detailsOpen}
          onDetailsToggle={() => setDetailsOpen((prev) => !prev)}
          orientationOpen={orientationOpen}
          onOrientationToggle={() => setOrientationOpen((prev) => !prev)}
          activeImageOrientation={activeImageTab ? (orientationByImageId[activeImageTab.imageId] || []) : []}
          onToggleOrientation={toggleImageOrientation}
          onShareOpen={() => setShareOpen(true)}
          canEditCredit={true}
          isAnonymous={isAnonymousSubmission}
          onAnonymousChange={setIsAnonymousSubmission}
          creditPlatform={creditPlatform}
          onCreditPlatformChange={setCreditPlatform}
          creditHandle={creditHandle}
          onCreditHandleChange={setCreditHandle}
        />

        <CollaboratorDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Draft collaborators"
          description={isOwner
            ? 'Create a link for collaborators to help edit this draft before publishing.'
            : 'You can view collaborators. Only the owner can manage invites.'}
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
          inviteUrlPrefix="/api/submissions/drafts/collaborate"
          onCreateInvite={() => { void handleCreateInvite() }}
          onCopyInvite={(url) => { void handleCopyInvite(url) }}
          onRevokeInvite={(inviteId) => { void handleRevokeInvite(inviteId) }}
          onRemoveCollaborator={(userId) => { void handleRemoveCollaborator(userId) }}
          showLeaveButton
          currentUserId={currentUserId}
          onLeave={() => { if (currentUserId) void handleRemoveCollaborator(currentUserId) }}
        />

        <Dialog open={!!conflict} onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft updated by another collaborator</DialogTitle>
              <DialogDescription>
                {conflict?.lastEditorName
                  ? `${conflict.lastEditorName} saved a newer version of this draft.`
                  : 'A newer version exists on the server.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Reload the latest draft before continuing. You can copy your unsaved edits first.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void handleReloadLatestDraft() }}
                  className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Reload latest draft
                </button>
                <button
                  type="button"
                  onClick={() => { void handleCopyUnsavedEdits() }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Copy unsaved edits
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
