'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sortFaceDirections, coordinateKey } from '@/lib/face-directions'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/features/submissions/lib/editor-image-state'
import { buildHighResCanvasUrl } from '@/features/route-editor/route-editor-utils'
import { useRouteStore } from '@/features/route-editor/store'
import { useDraftUploadManager } from '@/features/submissions/upload/hooks/use-draft-upload-manager'
import { useMediaUploadManager } from '@/features/submissions/upload/hooks/use-media-upload-manager'
import { useAtlasAutoSync } from '@/features/submissions/editor/location/use-atlas-auto-sync'
import { useDraftEditorData } from '@/features/submissions/draft-editor/hooks/use-draft-editor-data'
import { useEditDraftActions } from '@/features/submissions/draft-editor/hooks/use-edit-draft-actions'
import { useEditDraftData } from '@/features/submissions/draft-editor/hooks/use-edit-draft-data'
import { useEditDraftHydration } from '@/features/submissions/draft-editor/hooks/use-edit-draft-hydration'
import { useEditDraftLocationSync } from '@/features/submissions/draft-editor/hooks/use-edit-draft-location-sync'
import { useEditDraftRouteSync } from '@/features/submissions/draft-editor/hooks/use-edit-draft-route-sync'
import { useEditDraftUploads } from '@/features/submissions/draft-editor/hooks/use-edit-draft-uploads'
import { useDraftCollaborators } from '@/features/submissions/editor/collaboration/use-draft-collaborators'
import { useDraftLocationMetadata } from '@/features/submissions/editor/location/use-draft-location-metadata'
import { useDraftConflictResolution } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import { useDraftRouteEditing } from '@/features/submissions/draft-editor/hooks/use-draft-route-editing'
import type { FaceDirection, ImageSelection, RouteLine } from '@/features/submissions/lib/submission-types'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import type { UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { uploadDebug } from '@/lib/media/upload-debug'
import { csrfFetch } from '@/hooks/useCsrf'
import {
  buildDraftRouteLines,
  isValidLocationCoordinate,
  parseDraftMarkerPosition,
  resolveDraftClimbType,
  type ManageImageTab,
} from '@/features/submissions/draft-editor/lib/edit-draft-types'

interface UseDraftEditorOrchestrationParams {
  draftId: string
  addToast: (message: string, tone: 'success' | 'error') => void
}

export function useDraftEditorOrchestration({
  draftId,
  addToast,
}: UseDraftEditorOrchestrationParams) {
  const searchParams = useSearchParams()
  const { conflict, setConflict, clearConflict } = useDraftConflictResolution()
  const { detailsOpen, setDetailsOpen, orientationOpen, setOrientationOpen } = useDraftRouteEditing()

  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { showCragSelector, setShowCragSelector, latitude, setLatitude, longitude, setLongitude, searchQuery, setSearchQuery, searchingLocation, setSearchingLocation, mapOpen, setMapOpen, updateDraftLocation } = useDraftLocationMetadata()
  const markerPosition = useMemo<[number, number] | null>(() => parseDraftMarkerPosition(latitude, longitude), [latitude, longitude])
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [ownerUserId] = useState<string | null>(null)
  const [ownerProfile] = useState<{ displayName: string; username: string | null } | null>(null)
  const [addingImages, setAddingImages] = useState(false)
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)
  const [switchingImageId, setSwitchingImageId] = useState<string | null>(null)
  const switchingImageLockRef = useRef(false)
  const addImageInputRef = useRef<HTMLInputElement | null>(null)
  const publishRequirementsRef = useRef<HTMLDivElement | null>(null)
  const cragSectionRef = useRef<HTMLDivElement | null>(null)
  const locationSectionRef = useRef<HTMLDivElement | null>(null)
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef>(null)
  const isFetchingRef = useRef(false)
  const needsRefetchRef = useRef(false)
  const { setMode, setInteractionTool, reset, clearCanvasState, selectedRouteId, routes: routeStoreRoutes, setRoutes: setRouteStoreRoutes, setSelectedRoute, setActiveRoute, setEditorPanelOpen, currentPoints, interactionTool, undoLastPoint } = useRouteStore()
  const { uploads, hasPendingUploads, hasFailedUploads, retryUpload, removeUpload, registerDraftUpdatedAt, queueDraftUploads, resumeQueue, isQueuePaused, subscribeToUploadComplete } = useDraftUploadManager()
  const { getUploadsForCrag } = useMediaUploadManager()
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)

  const {
    isInitialLoading,
    error: draftError,
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
    hasHydratedLocationRef,
    lastLocationSyncRef,
  } = useEditDraftData({
    draftId,
    uploads,
    registerDraftUpdatedAt,
    clearConflict,
    setLatitude,
    setLongitude,
    setShowCragSelector,
  })

  useEffect(() => {
    setError(draftError)
  }, [draftError])

  const { shareOpen, setShareOpen, loadingCollaborators, collaborators, activeInvites, creatingInvite, revokingInviteId, removingCollaboratorId, latestInviteUrl, loadCollaborators, handleCreateInvite, handleCopyInvite, handleRevokeInvite, handleRemoveCollaborator } = useDraftCollaborators(draftId, isOwner, addToast, setError)
  const collaborationAdded = searchParams.get('collab') === 'added'
  const { currentUserId, leaflet } = useEditDraftHydration({
    collaborationAdded,
    activeImageId,
    loadCollaborators,
    addToast,
    setMode,
    setInteractionTool,
    reset,
    clearCanvasState,
  })
  const atlasSync = useAtlasAutoSync(markerPosition?.[0] ?? null, markerPosition?.[1] ?? null)
  const nearbyCragId = atlasSync.nearbyCrag?.id ?? null
  const nearbyCragName = atlasSync.nearbyCrag?.name ?? null
  const { imagesPayload, imagesPayloadSignature } = useDraftEditorData({ draft, routeType, routesByImageId, manageImages })

  const {
    pendingDraftUploads,
    queuePaused,
    pendingCragUploads,
    mergedCragCanvasImages,
    mergedManageImages,
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

  const activeImageTab = useMemo(() => {
    if (!activeImageId) return null
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    return sourceImages.find((image) => image.imageId === activeImageId) || null
  }, [activeImageId, canvasSource, mergedCragCanvasImages, mergedManageImages])

  const activeDraftImageId = activeImageTab?.imageId || null
  const activeImageLocationMode = activeDraftImageId ? (resolveLocationMode(locationModeByImageId[activeDraftImageId])) : 'shared'
  const pendingActiveImageCustomGps = activeDraftImageId ? customGpsByImageId[activeDraftImageId] : undefined
  const pendingActiveImageCustomPosition = useMemo<[number, number] | null>(() => {
    if (!activeDraftImageId || activeImageLocationMode !== 'custom') return null
    if (!pendingActiveImageCustomGps || !isValidLocationCoordinate(pendingActiveImageCustomGps.latitude, pendingActiveImageCustomGps.longitude)) return null
    return [pendingActiveImageCustomGps.latitude as number, pendingActiveImageCustomGps.longitude as number]
  }, [activeDraftImageId, activeImageLocationMode, pendingActiveImageCustomGps])

  const activeRoutes = useMemo(() => {
    if (!activeDraftImageId) return []
    return routesByImageId[activeDraftImageId] || []
  }, [activeDraftImageId, routesByImageId])

  const existingRouteLines = useMemo(() => buildDraftRouteLines(activeRoutes, activeDraftImageId, routeType), [activeRoutes, activeDraftImageId, routeType])

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

  const stableActiveImageUrl = imageSelection && 'imageUrl' in imageSelection ? imageSelection.imageUrl : ''

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

  const publishedMapPins = useMemo<LightweightCragMapPin[]>(() => {
    const draftCoordinateKeys = new Set(
      quickSwitcherImages
        .filter((image) => typeof image.latitude === 'number' && typeof image.longitude === 'number')
        .map((image) => coordinateKey(image.latitude as number, image.longitude as number))
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

  const {
    activeImageCustomPosition,
    handleMapClick,
    handleMarkerDragEnd,
    handleSearchLocation,
  } = useEditDraftLocationSync({
    draft,
    draftId,
    draftUpdatedAt,
    routeType,
    isAnonymousSubmission,
    creditPlatform,
    creditHandle,
    latitude,
    longitude,
    effectiveMarkerPosition: pendingActiveImageCustomPosition || markerPosition,
    activeDraftImageId,
    activeImageLocationMode,
    customGpsByImageId,
    locationModeByImageId,
    mergedManageImages,
    imagesPayload,
    imagesPayloadSignature,
    routesByImageId,
    selectedCrag,
    cragId,
    nearbyCragId,
    nearbyCragName,
    nearbyCragDominantRouteType: atlasSync.nearbyCrag?.dominantRouteType ?? null,
    hasExplicitRouteType,
    atlasSync,
    hasHydratedLocationRef,
    lastLocationSyncRef,
    setLatitude,
    setLongitude,
    setDraftUpdatedAt,
    setRouteType,
    setCragId,
    setSelectedCrag,
    setCustomGpsByImageId,
    updateDraftLocation,
    setMapOpen,
    searchQuery,
    setSearchingLocation,
    setLocationSearchError,
  })

  const effectiveMarkerPosition = activeImageCustomPosition || markerPosition
  const effectivePublishLocation = useMemo<[number, number] | null>(() => {
    if (effectiveMarkerPosition) return effectiveMarkerPosition
    const fallbackImage = mergedManageImages.find((image) => isValidLocationCoordinate(image.latitude, image.longitude)) || null
    if (!fallbackImage) return null
    return [fallbackImage.latitude as number, fallbackImage.longitude as number]
  }, [effectiveMarkerPosition, mergedManageImages])
  const hasValidLocation = effectivePublishLocation !== null

  const {
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
    publishRequirementsRef,
    cragSectionRef,
    locationSectionRef,
    hasPendingUploads,
    hasFailedUploads,
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

  useEffect(() => {
    if (!activeImageId) return
    const activeQuickSwitchImage = quickSwitcherImages.find((image) => image.imageId === activeImageId) || null
    const lat = activeImageCustomPosition?.[0] ?? activeQuickSwitchImage?.latitude ?? null
    const lng = activeImageCustomPosition?.[1] ?? activeQuickSwitchImage?.longitude ?? null
    if (lat === null && lng === null) return
    uploadDebug('editor-active-image-map-data', {
      activeImageId,
      hasQuickSwitchImage: Boolean(activeQuickSwitchImage),
      latitude: lat,
      longitude: lng,
    })
  }, [activeImageCustomPosition, activeImageId, quickSwitcherImages])

  const { handleCanvasRoutesUpdate, scheduleDraftPersist, skipRouteStoreSyncRef } = useEditDraftRouteSync({
    activeDraftImageId,
    routeType,
    routeStoreRoutes,
    existingRouteLines,
    setRouteStoreRoutes,
    setRoutesByImageId,
  })

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

  const handleQuickSwitchImage = useCallback(async (imageId: string) => {
    if (imageId === activeImageId || switchingImageLockRef.current) return

    const targetImage = quickSwitcherImages.find((image) => image.imageId === imageId) || null
    switchingImageLockRef.current = true
    setSwitchingImageId(imageId)

    try {
      const saved = await saveDraft()
      if (!saved) return

      setActiveImageId(imageId)
      if (targetImage?.sourceKind === 'crag-image' && cragId) {
        setCanvasSource({ kind: 'crag-image', cragImageId: imageId, cragId })
      } else {
        setCanvasSource({ kind: 'draft-image', draftImageId: imageId })
      }
      window.setTimeout(() => {
        focusDrawingArea('smooth')
      }, 0)
    } finally {
      switchingImageLockRef.current = false
      setSwitchingImageId(null)
    }
  }, [activeImageId, cragId, focusDrawingArea, quickSwitcherImages, saveDraft, setActiveImageId, setCanvasSource])

  const isImageSwitching = switchingImageId !== null || savingDraft

  const handleReorderDraftImages = useCallback(async (imageIds: string[]) => {
    if (!draft || !draftUpdatedAt) return

    const previousManageImages = manageImages
    const nextManageImages = reorderItemsByIds(manageImages, imageIds).map((image) => ({
      ...image,
      locationMode: resolveLocationMode(locationModeByImageId[image.imageId] || image.locationMode),
    }))

    setManageImages(nextManageImages)
    setError(null)

    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_updated_at: draftUpdatedAt,
          images: nextManageImages
            .filter((image) => image.sourceKind === 'draft-image')
            .map((image, index) => {
              const existingImage = draft.images.find((candidate) => candidate.id === image.imageId)
              return {
                id: image.imageId,
                display_order: index,
                route_data: existingImage?.route_data || {},
              }
            }),
        }),
      })

      const payload = await response.json().catch(() => ({ error: 'Failed to reorder draft images' })) as {
        error?: string
        draft?: { updated_at?: string }
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to reorder draft images')
      }

      if (payload.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
        registerDraftUpdatedAt(draftId, payload.draft.updated_at)
      }

      setDraft((current) => {
        if (!current) return current
        const imageById = new Map(current.images.map((image) => [image.id, image]))
        const reorderedImages = imageIds
          .map((imageId, index) => {
            const image = imageById.get(imageId)
            return image ? { ...image, display_order: index } : null
          })
          .filter((image): image is typeof current.images[number] => image !== null)

        return {
          ...current,
          updated_at: payload.draft?.updated_at || current.updated_at,
          images: reorderedImages,
        }
      })
    } catch (err) {
      setManageImages(previousManageImages)
      const message = err instanceof Error ? err.message : 'Failed to reorder draft images'
      setError(message)
      addToast(message, 'error')
    }
  }, [addToast, draft, draftId, draftUpdatedAt, locationModeByImageId, manageImages, registerDraftUpdatedAt, setDraft, setDraftUpdatedAt, setError, setManageImages])

  const setActiveAsDefault = useCallback(() => {
    if (!activeImageTab || activeImageTab.sourceKind !== 'draft-image') return
    persistMetadataImmediately(() => {
      setDefaultImageId(activeImageTab.imageId)
      setCanvasSource({ kind: 'draft-image', draftImageId: activeImageTab.imageId })
    })
  }, [activeImageTab, persistMetadataImmediately, setCanvasSource, setDefaultImageId])

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

  const onSelectCrag = useCallback((crag: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
    setCragId(crag.id)
    setSelectedCrag(crag)
    setCragCanvasImages([])
    setShowCragSelector(false)
    setSuccess('Crag selected for this draft.')
    void saveDraft({ overrideCragId: crag.id })
  }, [setCragId, setSelectedCrag, setCragCanvasImages, setShowCragSelector, setSuccess, saveDraft])

  const onCreateCrag = useCallback((crag: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
    setCragId(crag.id)
    setSelectedCrag(crag)
    setCragCanvasImages([])
    setCanvasSource(null)
    setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
    setShowCragSelector(false)
    void saveDraft({ overrideCragId: crag.id })
  }, [setCragId, setSelectedCrag, setCragCanvasImages, setCanvasSource, setSuccess, setShowCragSelector, saveDraft])

  const onLocationModeChange = useCallback((mode: 'shared' | 'custom') => {
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
  }, [activeDraftImageId, setLocationModeByImageId, setManageImages, setCustomGpsByImageId, markerPosition])

  const onRouteTypeChange = useCallback((nextRouteType: string) => {
    persistMetadataImmediately(() => {
      setHasExplicitRouteType(true)
      setRouteType(nextRouteType)
    })
  }, [persistMetadataImmediately, setHasExplicitRouteType, setRouteType])

  const onMapOpenChange = useCallback((open: boolean) => {
    if (open) {
      setMapOpen(true)
    } else {
      void saveDraft().then(() => setMapOpen(false))
    }
  }, [setMapOpen, saveDraft])

  const onCustomGpsChange = useCallback((imageId: string, gps: { latitude: number | null; longitude: number | null }) => {
    setCustomGpsByImageId((prev) => ({ ...prev, [imageId]: gps }))
  }, [setCustomGpsByImageId])

  return {
    refs: {
      addImageInputRef,
      publishRequirementsRef,
      cragSectionRef,
      locationSectionRef,
      drawingAreaRef,
      routeCanvasRef,
      skipRouteStoreSyncRef,
    },
    state: {
      success,
      setError,
      sectorId,
      setSectorId,
      ownerUserId,
      ownerProfile,
      isImageSwitching,
    },
    conflict: {
      conflict,
      setConflict,
      clearConflict,
    },
    routeEditing: {
      detailsOpen,
      setDetailsOpen,
      orientationOpen,
      setOrientationOpen,
    },
    location: {
      showCragSelector,
      latitude,
      longitude,
      searchQuery,
      searchingLocation,
      mapOpen,
      setMapOpen,
      setSearchQuery,
      locationSearchError,
      markerPosition,
      effectiveMarkerPosition,
      effectivePublishLocation,
      hasValidLocation,
      handleMapClick,
      handleMarkerDragEnd,
      handleSearchLocation,
    },
    canvas: {
      routeCanvasRef,
      selectedRouteId,
      routes: routeStoreRoutes,
      setRoutes: setRouteStoreRoutes,
      setSelectedRoute,
      setActiveRoute,
      setEditorPanelOpen,
      currentPoints,
      interactionTool,
      setInteractionTool,
      undoLastPoint,
    },
    uploads: {
      uploads,
      hasPendingUploads,
      hasFailedUploads,
      retryUpload,
      removeUpload,
      resumeQueue,
      pendingDraftUploads,
      queuePaused,
      pendingCragUploads,
    },
    draft: {
      isInitialLoading,
      error,
      draft,
      manageImages,
      activeImageId,
      setActiveImageId,
      defaultImageId,
      orientationByImageId,
      routesByImageId,
      setRoutesByImageId,
      locationModeByImageId,
      customGpsByImageId,
      routeType,
      hasExplicitRouteType,
      creditPlatform,
      creditHandle,
      isAnonymousSubmission,
      setIsAnonymousSubmission,
      setCreditPlatform,
      setCreditHandle,
      cragId,
      selectedCrag,
      canvasSource,
      cragCanvasImages,
      draftUpdatedAt,
      isOwner,
      publishedCragPins,
      currentUserId,
      leaflet,
    },
    merged: {
      mergedCragCanvasImages,
      mergedManageImages,
    },
    derived: {
      activeImageTab,
      activeDraftImageId,
      activeImageLocationMode,
      activeImageCustomPosition,
      activeRoutes,
      existingRouteLines,
      imageSelection,
      stableActiveImageUrl,
      activeImageReady,
      quickSwitcherImages,
      draftMapPins,
      publishedMapPins,
      atlasSync,
    },
    actions: {
      savingDraft,
      publishingDraft,
      publishAttempted,
      publishValidationMessage,
      saveDraft,
      handleDeleteDraft,
      handleManualSave,
      publishDraft,
      handleReloadLatestDraft,
      handleAddImages,
      handleQuickBarDropFiles,
      handleRemoveImage,
      handleQuickSwitchImage,
      handleReorderDraftImages,
      setActiveAsDefault,
      handleCopyUnsavedEdits,
      toggleImageOrientation,
      focusDrawingArea,
      handleCanvasRoutesUpdate,
      onShowCragSelector: setShowCragSelector,
      onSelectCrag,
      onCreateCrag,
      onLocationModeChange,
      onRouteTypeChange,
      onLatitudeChange: setLatitude,
      onLongitudeChange: setLongitude,
      onCustomGpsChange,
      onMapOpenChange,
      onSearchQueryChange: setSearchQuery,
    },
    collaboration: {
      shareOpen,
      setShareOpen,
      loadingCollaborators,
      collaborators,
      activeInvites,
      creatingInvite,
      revokingInviteId,
      removingCollaboratorId,
      latestInviteUrl,
      handleCreateInvite,
      handleCopyInvite,
      handleRevokeInvite,
      handleRemoveCollaborator,
    },
  }
}
