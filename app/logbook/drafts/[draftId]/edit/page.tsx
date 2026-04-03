'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/features/logbook/components/toast'
import { SubmissionWorkstation } from '@/features/submissions/components/SubmissionWorkstation'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/features/submissions/lib/editor-image-state'
import { sortFaceDirections, coordinateKey } from '@/features/submissions/lib/editor-helpers'
import type { FaceDirection, ImageSelection, RouteLine } from '@/features/submissions/lib/submission-types'
import { type LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { type UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import { useRouteStore } from '@/features/route-editor/store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAtlasAutoSync } from '@/features/submissions/editor/location/use-atlas-auto-sync'
import { useDraftUploadManager } from '@/features/submissions/upload/hooks/use-draft-upload-manager'
import { useMediaUploadManager } from '@/features/submissions/upload/hooks/use-media-upload-manager'
import { uploadDebug } from '@/lib/media/upload-debug'
import { CollaboratorDialog } from '@/features/submissions/components/editor/collaborator-dialog'
import { useDraftEditorData } from '@/features/submissions/draft-editor/hooks/use-draft-editor-data'
import { useEditDraftActions } from '@/features/submissions/draft-editor/hooks/use-edit-draft-actions'
import { useDraftConflictResolution } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import { useEditDraftData } from '@/features/submissions/draft-editor/hooks/use-edit-draft-data'
import { useEditDraftHydration } from '@/features/submissions/draft-editor/hooks/use-edit-draft-hydration'
import { useEditDraftLocationSync } from '@/features/submissions/draft-editor/hooks/use-edit-draft-location-sync'
import { useEditDraftRouteSync } from '@/features/submissions/draft-editor/hooks/use-edit-draft-route-sync'
import { useEditDraftUploads } from '@/features/submissions/draft-editor/hooks/use-edit-draft-uploads'
import { useDraftCollaborators } from '@/features/submissions/editor/collaboration/use-draft-collaborators'
import { useDraftLocationMetadata } from '@/features/submissions/editor/location/use-draft-location-metadata'
import { useDraftRouteEditing } from '@/features/submissions/draft-editor/hooks/use-draft-route-editing'
import { buildHighResCanvasUrl } from '@/features/route-editor/route-editor-utils'
import {
  buildDraftRouteLines,
  isValidLocationCoordinate,
  parseDraftMarkerPosition,
  resolveDraftClimbType,
  type ManageImageTab,
} from '@/features/submissions/draft-editor/lib/edit-draft-types'
import { DraftToolbar } from '@/features/submissions/draft-editor/components/DraftToolbar'
import { DraftMetadataPanel } from '@/features/submissions/draft-editor/components/DraftMetadataPanel'
import { DraftDetailsPanel } from '@/features/submissions/draft-editor/components/DraftDetailsPanel'
import { DraftUploadQueue } from '@/features/submissions/upload/components/DraftUploadQueue'
import { csrfFetch } from '@/hooks/useCsrf'


export default function EditDraftPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string
  const { conflict, setConflict, clearConflict } = useDraftConflictResolution()
  const { detailsOpen, setDetailsOpen, orientationOpen, setOrientationOpen } = useDraftRouteEditing()

  const [success, setSuccess] = useState<string | null>(null)
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

  const { handleCanvasRoutesUpdate, scheduleDraftPersist, skipRouteStoreSyncRef } = useEditDraftRouteSync({
    activeDraftImageId,
    routeType,
    routeStoreRoutes,
    existingRouteLines,
    setRouteStoreRoutes,
    setRoutesByImageId,
  })

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
    } catch (error) {
      setManageImages(previousManageImages)
      const message = error instanceof Error ? error.message : 'Failed to reorder draft images'
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
            imageSwitchingDisabled={isImageSwitching}
            onRetryActiveImage={activeImageTab?.status === 'FAILED' ? () => retryUpload(activeImageTab.imageId) : undefined}
            onDeleteActiveImage={activeImageTab?.status === 'FAILED' ? () => { void handleRemoveImage(activeImageTab.imageId) } : undefined}
            draftPins={draftMapPins}
            publishedPins={publishedMapPins}
            initialCenter={markerPosition}
            hideRouteActions={mapOpen}
            onSelectImage={handleQuickSwitchImage}
            onReorderImages={(imageIds) => { void handleReorderDraftImages(imageIds) }}
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
                scheduleDraftPersist()
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
            void saveDraft({ overrideCragId: crag.id })
          }}
          onCreateCrag={(crag) => {
            setCragId(crag.id)
            setSelectedCrag(crag)
            setCragCanvasImages([])
            setCanvasSource(null)
            setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
            setShowCragSelector(false)
            void saveDraft({ overrideCragId: crag.id })
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
              void saveDraft().then(() => setMapOpen(false))
            }
          }}
          onSearchQueryChange={setSearchQuery}
          onSearchLocation={handleSearchLocation}
          onRouteTypeChange={(nextRouteType) => {
            persistMetadataImmediately(() => {
              setHasExplicitRouteType(true)
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
