'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { UserResponse } from '@supabase/supabase-js'
import { ToastContainer, useToast } from '@/features/logbook/components/toast'
import { SubmissionWorkstation } from '@/features/submissions/components/SubmissionWorkstation'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/features/submissions/lib/editor-image-state'
import { sortFaceDirections, coordinateKey } from '@/features/submissions/lib/editor-helpers'
import type { EditableRoute } from '@/features/submissions/lib/editor-types'
import type { FaceDirection, ImageSelection, RouteLine } from '@/features/submissions/lib/submission-types'
import { type LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { type UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { useRouteStore } from '@/features/route-editor/store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/features/editor/location/use-atlas-auto-sync'
import { useDraftUploadManager } from '@/features/submissions/upload/hooks/use-draft-upload-manager'
import { useMediaUploadManager } from '@/features/submissions/upload/hooks/use-media-upload-manager'
import { uploadDebug } from '@/lib/media/upload-debug'
import { createClient } from '@/lib/supabase'
import { CollaboratorDialog } from '@/features/submissions/components/editor/collaborator-dialog'
import { useDraftEditorData } from '@/features/submissions/draft-editor/hooks/use-draft-editor-data'
import { useEditDraftActions } from '@/features/submissions/draft-editor/hooks/use-edit-draft-actions'
import { useDraftConflictResolution } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import { useEditDraftData } from '@/features/submissions/draft-editor/hooks/use-edit-draft-data'
import { useEditDraftUploads } from '@/features/submissions/draft-editor/hooks/use-edit-draft-uploads'
import { useDraftCollaborators } from '@/features/submissions/editor/collaboration/use-draft-collaborators'
import { useDraftLocationMetadata } from '@/features/submissions/editor/location/use-draft-location-metadata'
import { useDraftRouteEditing } from '@/features/submissions/draft-editor/hooks/use-draft-route-editing'
import { formatCoordinate } from '@/features/editor/location/location-metadata'
import { haveStoredRoutesChanged } from '@/features/editor/route-store-sync'
import { areSerializedRoutesEqual, buildHighResCanvasUrl } from '@/features/route-editor/route-editor-utils'
import {
  isValidLocationCoordinate,
  resolveDraftClimbType,
  type DraftRoute,
  type ManageImageTab,
} from '@/features/submissions/draft-editor/lib/edit-draft-types'
import { DraftToolbar } from '@/features/submissions/draft-editor/components/DraftToolbar'
import { DraftMetadataPanel } from '@/features/submissions/draft-editor/components/DraftMetadataPanel'
import { DraftDetailsPanel } from '@/features/submissions/draft-editor/components/DraftDetailsPanel'
import { DraftUploadQueue } from '@/features/submissions/upload/components/DraftUploadQueue'


export default function EditDraftPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string
  const { conflict, setConflict, clearConflict } = useDraftConflictResolution()
  const { detailsOpen, setDetailsOpen, orientationOpen, setOrientationOpen } = useDraftRouteEditing()

  const [success, setSuccess] = useState<string | null>(null)
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
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
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
  const previousActiveImageIdRef = useRef<string | null>(null)
  const lastSeededRouteImageIdRef = useRef<string | null>(null)
  const skipRouteStoreSyncRef = useRef<string | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef>(null)
  const isFetchingRef = useRef(false)
  const needsRefetchRef = useRef(false)
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const { setMode, setInteractionTool, reset, clearCanvasState, selectedRouteId, routes: routeStoreRoutes, setRoutes: setRouteStoreRoutes, setSelectedRoute, setActiveRoute, setEditorPanelOpen, currentPoints, interactionTool, undoLastPoint } = useRouteStore()
  const { uploads, hasPendingUploads, hasFailedUploads, retryUpload, removeUpload, registerDraftUpdatedAt, queueDraftUploads, resumeQueue, isQueuePaused, subscribeToUploadComplete } = useDraftUploadManager()
  const { getUploadsForCrag } = useMediaUploadManager()
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const {
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
    lastPersistedRoutesRef,
    autosavePausedRef,
    autosavePausedSnapshotRef,
    hasHydratedLocationRef,
    lastLocationSyncRef,
  } = useEditDraftData({
    draftId,
    sectorId,
    uploads,
    registerDraftUpdatedAt,
    clearConflict,
    setLatitude,
    setLongitude,
    setShowCragSelector,
    clearAutosave: () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    },
    resetAutosaveState: () => {
      setAutosaveState('idle')
    },
  })
  const { shareOpen, setShareOpen, loadingCollaborators, collaborators, activeInvites, creatingInvite, revokingInviteId, removingCollaboratorId, latestInviteUrl, loadCollaborators, handleCreateInvite, handleCopyInvite, handleRevokeInvite, handleRemoveCollaborator } = useDraftCollaborators(draftId, isOwner, addToast, setError)
  const atlasSync = useAtlasAutoSync(markerPosition?.[0] ?? null, markerPosition?.[1] ?? null)
  const atlasCountryId = atlasSync.atlas?.countryId ?? null
  const atlasCountryCode = atlasSync.atlas?.countryCode ?? null
  const atlasCountryName = atlasSync.atlas?.countryName ?? null
  const atlasAdminRegionName = atlasSync.atlas?.adminRegionName ?? null
  const atlasUnRegionName = atlasSync.atlas?.unRegionName ?? null
  const atlasContinentName = atlasSync.atlas?.continentName ?? null
  const nearbyCragId = atlasSync.nearbyCrag?.id ?? null
  const nearbyCragName = atlasSync.nearbyCrag?.name ?? null
  const { imagesPayload, imagesPayloadSignature } = useDraftEditorData({ draft, routeType, routesByImageId, manageImages })
  const {
    pendingDraftUploads,
    queuePaused,
    pendingCragUploads,
    mergedCragCanvasImages,
    mergedManageImages,
    hasInFlightDraftUploads,
    handleAddImages,
    handleQuickBarDropFiles,
    handleRemoveImage,
  } = useEditDraftUploads({
    draftId,
    draft,
    draftUpdatedAt,
    cragId,
    activeImageId,
    defaultImageId,
    canvasSource,
    addingImages,
    removingImageId,
    manageImages,
    cragCanvasImages,
    uploads,
    addImageInputRef,
    isFetchingRef,
    needsRefetchRef,
    setAddingImages,
    setRemovingImageId,
    setError,
    setSuccess,
    setDraftUpdatedAt,
    setActiveImageId,
    setDefaultImageId,
    setCanvasSource,
    setOrientationByImageId,
    setRoutesByImageId,
    setConflict,
    loadDraft,
    syncUploadedImages,
    registerDraftUpdatedAt,
    queueDraftUploads,
    isQueuePaused,
    subscribeToUploadComplete,
    getUploadsForCrag,
    removeUpload,
  })

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


  const averagedRouteImageLocation = useMemo<[number, number] | null>(() => {
    const qualifyingCoordinates = mergedManageImages
      .filter((image) => {
        const routes = routesByImageId[image.imageId] || []
        if (routes.length === 0) return false
        if (resolveLocationMode(locationModeByImageId[image.imageId]) === 'custom') return false
        return isValidLocationCoordinate(image.latitude, image.longitude)
      })
      .map((image) => [image.latitude as number, image.longitude as number] as const)

    if (qualifyingCoordinates.length === 0) return null

    const totals = qualifyingCoordinates.reduce((acc, [lat, lng]) => ({
      latitude: acc.latitude + lat,
      longitude: acc.longitude + lng,
    }), { latitude: 0, longitude: 0 })

    return [
      totals.latitude / qualifyingCoordinates.length,
      totals.longitude / qualifyingCoordinates.length,
    ]
  }, [locationModeByImageId, mergedManageImages, routesByImageId])

  const stableCanvasUrlRef = useRef<{ imageId: string | null; imageUrl: string }>({ imageId: null, imageUrl: '' })


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
  const {
    autosaveState,
    setAutosaveState,
    savingDraft,
    publishingDraft,
    publishAttempted,
    publishValidationMessage,
    saveDraft,
    handleDeleteDraft,
    persistMetadataImmediately,
    handleManualSave,
    publishDraft,
    handleReloadLatestDraft,
  } = useEditDraftActions({
    draftId,
    draft,
    draftUpdatedAt,
    currentUserId,
    isOwner,
    routeType,
    creditPlatform,
    creditHandle,
    isAnonymousSubmission,
    cragId,
    sectorId,
    canvasSource,
    defaultImageId,
    manageImages,
    routesByImageId,
    orientationByImageId,
    locationModeByImageId,
    customGpsByImageId,
    markerPosition,
    imagesPayloadSignature,
    autosavePausedRef,
    autosavePausedSnapshotRef,
    hasLoadedRoutesRef,
    lastPersistedRoutesRef,
    publishRequirementsRef,
    cragSectionRef,
    locationSectionRef,
    hasInFlightDraftUploads,
    hasPendingUploads,
    hasFailedUploads,
    isInitialLoading,
    conflict,
    defaultImageTab,
    defaultImageRoutesLength: defaultImageRoutes.length,
    hasValidLocation,
    loadDraft,
    loadCollaborators,
    addToast,
    setDraft,
    setDraftUpdatedAt,
    setError,
    setSuccess,
    setConflict,
    setActiveImageId,
  })

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
  }, [draft, hasHydratedLocationRef, isInitialLoading])

  useEffect(() => {
    if (!hasHydratedLocationRef.current || !averagedRouteImageLocation) return

    const [nextLatitude, nextLongitude] = averagedRouteImageLocation
    const currentLatitude = Number(latitude)
    const currentLongitude = Number(longitude)
    const hasSameLocation = Number.isFinite(currentLatitude)
      && Number.isFinite(currentLongitude)
      && Math.abs(currentLatitude - nextLatitude) < 0.000001
      && Math.abs(currentLongitude - nextLongitude) < 0.000001

    if (hasSameLocation) return

    setLatitude(formatCoordinate(nextLatitude))
    setLongitude(formatCoordinate(nextLongitude))
  }, [averagedRouteImageLocation, hasHydratedLocationRef, latitude, longitude, setLatitude, setLongitude])

  useEffect(() => {
    if (!hasHydratedLocationRef.current) return
    if (effectiveMarkerPosition || !fallbackLocation) return

    setLatitude(formatCoordinate(fallbackLocation[0]))
    setLongitude(formatCoordinate(fallbackLocation[1]))
  }, [effectiveMarkerPosition, fallbackLocation, hasHydratedLocationRef, setLatitude, setLongitude])

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
  }, [atlasAdminRegionName, atlasContinentName, atlasCountryCode, atlasCountryId, atlasCountryName, atlasUnRegionName, cragId, draft, draftId, effectiveMarkerPosition, imagesPayload.length, imagesPayloadSignature, isInitialLoading, nearbyCragId, nearbyCragName, hasHydratedLocationRef])

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
  }, [activeDraftImageId, setOrientationByImageId])

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
  }, [cragId, focusDrawingArea, quickSwitcherImages, setActiveImageId, setCanvasSource])


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
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation, setCustomGpsByImageId])

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
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation, setCustomGpsByImageId])

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
  }, [activeDraftImageId, draftIdRef, registerDraftUpdatedAt, routeType, setAutosaveState, setDraftUpdatedAt])

  const setActiveAsDefault = useCallback(() => {
    if (!activeImageTab || activeImageTab.sourceKind !== 'draft-image') return
    persistMetadataImmediately(() => {
      setDefaultImageId(activeImageTab.imageId)
      setCanvasSource({ kind: 'draft-image', draftImageId: activeImageTab.imageId })
    })
  }, [activeImageTab, persistMetadataImmediately, setCanvasSource, setDefaultImageId])

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
  }, [activeDraftImageId, routeType, scheduleDraftPersist, setRoutesByImageId])

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


  const handleCopyUnsavedEdits = useCallback(async () => {
    if (!conflict) return

    const textPayload = JSON.stringify(conflict.pendingChanges, null, 2)
    try {
      await navigator.clipboard.writeText(textPayload)
      addToast('Unsaved edits copied', 'success')
    } catch {
      setError('Failed to copy unsaved edits')
    }
  }, [addToast, conflict, setError])

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
            void saveDraft({ silent: true, overrideCragId: crag.id })
          }}
          onCreateCrag={(crag) => {
            setCragId(crag.id)
            setSelectedCrag(crag)
            setCragCanvasImages([])
            setCanvasSource(null)
            setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
            setShowCragSelector(false)
            void saveDraft({ silent: true, overrideCragId: crag.id })
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
