'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeDraftMetadata, readDraftRouteType, type OrientationDirection } from '@/features/submissions/lib/draft-metadata'
import { normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import { parseSerializedRouteData } from '@/features/route-editor/route-editor-utils'
import { uploadDebug } from '@/lib/media/upload-debug'
import type {
  CanvasSourceMetadata,
  CragImagePayload,
  DraftCanvasSource,
  DraftPayload,
  DraftRoute,
  ManageImageTab,
  PublishedCragImagePin,
} from '@/features/draft-editor/lib/edit-draft-types'
import { buildManageImageLabel, isDraftImageReady } from '@/features/draft-editor/lib/edit-draft-types'
import type { MediaUploadItem } from '@/features/media-upload/hooks/use-media-upload-manager'

interface UseEditDraftDataParams {
  draftId: string
  uploads: MediaUploadItem[]
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  clearConflict: () => void
  setLatitude: (value: string) => void
  setLongitude: (value: string) => void
  setShowCragSelector: (value: boolean) => void
}

export function useEditDraftData({
  draftId,
  uploads,
  registerDraftUpdatedAt,
  clearConflict,
  setLatitude,
  setLongitude,
  setShowCragSelector,
}: UseEditDraftDataParams) {
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [, setIsRefreshingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [manageImages, setManageImages] = useState<ManageImageTab[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [defaultImageId, setDefaultImageId] = useState<string | null>(null)
  const [orientationByImageId, setOrientationByImageId] = useState<Record<string, OrientationDirection[]>>({})
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, DraftRoute[]>>({})
  const [locationModeByImageId, setLocationModeByImageId] = useState<Record<string, 'shared' | 'custom'>>({})
  const [customGpsByImageId, setCustomGpsByImageId] = useState<Record<string, { latitude: number | null; longitude: number | null }>>({})
  const [routeType, setRouteType] = useState<string>('sport')
  const [hasExplicitRouteType, setHasExplicitRouteType] = useState(false)
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [isAnonymousSubmission, setIsAnonymousSubmission] = useState(false)
  const [cragId, setCragId] = useState<string | null>(null)
  const [selectedCrag, setSelectedCrag] = useState<{ id: string; name: string; latitude: number | null; longitude: number | null } | null>(null)
  const [canvasSource, setCanvasSource] = useState<DraftCanvasSource | null>(null)
  const [cragCanvasImages, setCragCanvasImages] = useState<CragImagePayload[]>([])
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [publishedCragPins, setPublishedCragPins] = useState<PublishedCragImagePin[]>([])

  const draftIdRef = useRef(draftId)
  const draftRef = useRef<DraftPayload | null>(null)
  const uploadsRef = useRef<MediaUploadItem[]>([])
  const hasLoadedRoutesRef = useRef(false)
  const hasHydratedLocationRef = useRef(false)
  const lastLocationSyncRef = useRef<string | null>(null)
  const loadDraftRef = useRef<() => Promise<void>>(undefined)

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
      const allDraftImages = [...(nextDraft.images || [])].sort((a, b) => a.display_order - b.display_order)
      const persistedImages = allDraftImages.filter((image) => image.id && typeof image.id === 'string')
      const sortedImages = persistedImages.filter((image) => isDraftImageReady(image))
      const hasPersistedImageRows = allDraftImages.length > 0
      const hasProcessingPersistedImages = allDraftImages.some((image) => image.readiness_status === 'processing')
      const hasErroredPersistedImages = hasPersistedImageRows && allDraftImages.every((image) => image.readiness_status === 'error')
      const hasPendingDraftUploadRows = uploadsRef.current.some((upload) => upload.target.kind === 'draft' && upload.target.draftId === currentDraftId)

      const metadata = nextDraft.metadata && typeof nextDraft.metadata === 'object' ? nextDraft.metadata : {}
      const normalizedMetadata = normalizeDraftMetadata(metadata, persistedImages)
      const canvasMetadata = metadata as CanvasSourceMetadata
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

      const nextManageImages = sortedImages.map<ManageImageTab>((image, index) => ({
        imageId: image.id,
        sourceKind: 'draft-image',
        index,
        label: buildManageImageLabel(index, image.id, nextDefaultImageId, nextOrientationByImageId[image.id]),
        signedUrl: image.proxy_url || '',
        latitude: typeof image.latitude === 'number' ? image.latitude : null,
        longitude: typeof image.longitude === 'number' ? image.longitude : null,
        locationMode: nextLocationModeByImageId[image.id] || 'shared',
      }))

      const explicitRouteType = readDraftRouteType(metadata)
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

      setRouteType(explicitRouteType || normalizedRouteType)
      setHasExplicitRouteType(Boolean(explicitRouteType))
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
      setError(loadError instanceof Error ? loadError.message : 'Failed to load draft')
    } finally {
      if (isFirstLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshingDraft(false)
      }
    }
  }, [clearConflict, registerDraftUpdatedAt, setLatitude, setLongitude, setShowCragSelector])

  const syncUploadedImages = useCallback(async () => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId || !draft) return

    try {
      await loadDraftRef.current?.()
    } catch (error) {
      uploadDebug('sync-uploaded-images-failed', { draftId: currentDraftId, error: String(error) })
    }
  }, [draft])

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
    loadDraftRef.current = loadDraft
  }, [loadDraft])

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
          const nextCragImages: CragImagePayload[] = payload.images
            .map((image: { id?: string; display_image_id?: string; linked_image_id?: string | null; signed_url?: string | null; width?: number | null; height?: number | null; latitude?: number | null; longitude?: number | null }) => ({
              id: typeof image.id === 'string' ? image.id : '',
              signed_url: typeof image.signed_url === 'string' ? image.signed_url : null,
              linked_image_id: typeof image.linked_image_id === 'string' ? image.linked_image_id : null,
              display_image_id: typeof image.display_image_id === 'string' ? image.display_image_id : null,
              width: typeof image.width === 'number' ? image.width : null,
              height: typeof image.height === 'number' ? image.height : null,
              latitude: typeof image.latitude === 'number' ? image.latitude : null,
              longitude: typeof image.longitude === 'number' ? image.longitude : null,
            }))
            .filter((image: CragImagePayload) => Boolean(image.id))
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

  return {
    isInitialLoading,
    error,
    setError,
    draft,
    setDraft,
    manageImages,
    setManageImages,
    activeImageId,
    setActiveImageId,
    defaultImageId,
    setDefaultImageId,
    orientationByImageId,
    setOrientationByImageId,
    routesByImageId,
    setRoutesByImageId,
    locationModeByImageId,
    setLocationModeByImageId,
    customGpsByImageId,
    setCustomGpsByImageId,
    routeType,
    setRouteType,
    hasExplicitRouteType,
    setHasExplicitRouteType,
    creditPlatform,
    setCreditPlatform,
    creditHandle,
    setCreditHandle,
    isAnonymousSubmission,
    setIsAnonymousSubmission,
    cragId,
    setCragId,
    selectedCrag,
    setSelectedCrag,
    canvasSource,
    setCanvasSource,
    cragCanvasImages,
    setCragCanvasImages,
    draftUpdatedAt,
    setDraftUpdatedAt,
    isOwner,
    publishedCragPins,
    loadDraft,
    syncUploadedImages,
    draftIdRef,
    hasLoadedRoutesRef,
    hasHydratedLocationRef,
    lastLocationSyncRef,
  }
}
