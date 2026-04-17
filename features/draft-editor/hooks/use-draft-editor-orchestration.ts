'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouteStore } from '@/features/route-editor/store'
import { useDraftUploadManager } from '@/features/media-upload/hooks/use-draft-upload-manager'
import { useMediaUploadManager } from '@/features/media-upload/hooks/use-media-upload-manager'
import { useAtlasAutoSync } from '@/features/submissions/editor/location/use-atlas-auto-sync'
import { useDraftEditorData } from '@/features/draft-editor/hooks/use-draft-editor-data'
import { useEditDraftActions } from '@/features/draft-editor/hooks/use-edit-draft-actions'
import { useEditDraftData } from '@/features/draft-editor/hooks/use-edit-draft-data'
import { useEditDraftHydration } from '@/features/draft-editor/hooks/use-edit-draft-hydration'
import { useEditDraftLocationSync } from '@/features/draft-editor/hooks/use-edit-draft-location-sync'
import { useEditDraftRouteSync } from '@/features/draft-editor/hooks/use-edit-draft-route-sync'
import { useEditDraftRouteStoreSync } from '@/features/draft-editor/hooks/use-edit-draft-route-store-sync'
import { useEditDraftUploads } from '@/features/draft-editor/hooks/use-edit-draft-uploads'
import { useDraftEditorActions } from '@/features/draft-editor/hooks/use-draft-editor-actions'
import { useDraftEditorDerivedState } from '@/features/draft-editor/hooks/use-draft-editor-derived-state'
import { useDraftCollaborators } from '@/features/collaboration/hooks/use-draft-collaborators'
import { useDraftLocationMetadata } from '@/features/submissions/editor/location/use-draft-location-metadata'
import { useDraftConflictResolution } from '@/features/draft-editor/hooks/use-draft-conflict-resolution'
import { useDraftRouteEditing } from '@/features/draft-editor/hooks/use-draft-route-editing'
import type { UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { uploadDebug } from '@/lib/media/upload-debug'
import {
  parseDraftMarkerPosition,
} from '@/features/draft-editor/lib/edit-draft-types'

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
  const [uploadAutoAssignToken, setUploadAutoAssignToken] = useState<string | null>(null)
  const switchingImageLockRef = useRef(false)
  const locationSyncInFlightRef = useRef(false)
  const setLocationSyncInFlight = (value: boolean) => { locationSyncInFlightRef.current = value }
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
    currentUserId,
    queueDraftUploads,
    isQueuePaused,
    subscribeToUploadComplete,
    getUploadsForCrag,
    removeUpload,
  })

  const {
    activeImageTab,
    activeDraftImageId,
    activeImageLocationMode,
    pendingActiveImageCustomPosition,
    activeRoutes,
    existingRouteLines,
    imageSelection,
    stableActiveImageUrl,
    activeImageReady,
    quickSwitcherImages,
    draftMapPins,
    publishedMapPins,
    effectiveMarkerPosition,
    effectivePublishLocation,
  } = useDraftEditorDerivedState({
    activeImageId,
    canvasSource,
    mergedCragCanvasImages,
    mergedManageImages,
    pendingCragUploads,
    pendingDraftUploads,
    defaultImageId,
    publishedCragPins,
    locationModeByImageId,
    customGpsByImageId,
    routesByImageId,
    routeType,
    cragCanvasImages,
    markerPosition,
  })

  const atlasSync = useAtlasAutoSync(effectiveMarkerPosition?.[0] ?? null, effectiveMarkerPosition?.[1] ?? null)
  const nearbyCragId = atlasSync.nearbyCrag?.id ?? null
  const nearbyCragName = atlasSync.nearbyCrag?.name ?? null

  useEffect(() => {
    if (!imageSelection || !('imageUrl' in imageSelection)) return
    uploadDebug('editor-active-image-url', {
      activeImageId,
      imageUrl: imageSelection.imageUrl,
      sourceKind: activeImageTab?.sourceKind || null,
      status: activeImageTab?.status || null,
    })
  }, [activeImageId, activeImageTab?.sourceKind, activeImageTab?.status, imageSelection])


  const {
    activeImageCustomPosition,
    handleMapClick,
    handleMarkerDragEnd,
    handleSearchLocation,
    flushLocationSync,
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
    uploadAutoAssignToken,
    setLocationSyncInFlight,
  })

  useEffect(() => {
    if (!draftId) return
    const unsubscribe = subscribeToUploadComplete((target, clientId, attachedRecordId) => {
      if (target.kind !== 'draft' || target.draftId !== draftId) return
      setUploadAutoAssignToken(attachedRecordId || clientId)
    })
    return unsubscribe
  }, [draftId, subscribeToUploadComplete])

  const hasValidLocation = effectivePublishLocation !== null

  const {
    savingDraft,
    publishingDraft,
    publishAttempted,
    publishValidationMessage,
    markMetadataDirty,
    markRoutesDirty,
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
    flushLocationSync,
    loadDraft,
    loadCollaborators,
    addToast,
    setDraft,
    setDraftUpdatedAt,
    setError,
    setSuccess,
    setConflict,
    setActiveImageId,
    setLocationSyncInFlight,
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

  const { handleCanvasRoutesUpdate } = useEditDraftRouteSync({
    activeDraftImageId,
    routeType,
    setRoutesByImageId,
    markRoutesDirty,
  })

  useEditDraftRouteStoreSync({
    activeDraftImageId,
    existingRouteLines,
    setRoutesByImageId,
    routeType,
    markRoutesDirty,
  })

  const focusDrawingArea = useCallback((behavior: ScrollBehavior = 'smooth') => {
    drawingAreaRef.current?.scrollIntoView({ behavior, block: 'start' })
  }, [])

  const isImageSwitching = switchingImageId !== null || savingDraft

  const {
    toggleImageOrientation,
    handleQuickSwitchImage,
    handleReorderDraftImages,
    setActiveAsDefault,
    handleCopyUnsavedEdits,
    onSelectCrag,
    onCreateCrag,
    onLocationModeChange,
    onRouteTypeChange,
    onMapOpenChange,
    onCustomGpsChange,
  } = useDraftEditorActions({
    draft,
    draftId,
    draftUpdatedAt,
    activeImageId,
    activeDraftImageId,
    activeImageTab,
    cragId,
    markerPosition,
    quickSwitcherImages,
    manageImages,
    locationModeByImageId,
    conflict,
    saveDraft,
    persistMetadataImmediately,
    markMetadataDirty,
    focusDrawingArea,
    addToast,
    setError,
    setSuccess,
    setManageImages,
    setDraft,
    setDraftUpdatedAt,
    registerDraftUpdatedAt,
    setActiveImageId,
    setCanvasSource,
    setDefaultImageId,
    setOrientationByImageId,
    setLocationModeByImageId,
    setCustomGpsByImageId,
    setCragId,
    setSelectedCrag,
    setCragCanvasImages,
    setShowCragSelector,
    setHasExplicitRouteType,
    setRouteType,
    setMapOpen,
    setSwitchingImageId,
    switchingImageLockRef,
  })

  return {
    refs: {
      addImageInputRef,
      publishRequirementsRef,
      cragSectionRef,
      locationSectionRef,
      drawingAreaRef,
      routeCanvasRef,
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
