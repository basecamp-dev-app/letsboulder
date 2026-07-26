// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftEditorOrchestration } from '@/features/draft-editor/hooks/use-draft-editor-orchestration'

const mockUseSearchParams = vi.fn()
const mockUseRouteStore = vi.fn()
const mockUseDraftUploadManager = vi.fn()
const mockUseMediaUploadManager = vi.fn()
const mockUseAtlasAutoSync = vi.fn()
const mockUseEditDraftData = vi.fn()
const mockUseDraftEditorData = vi.fn()
const mockUseDraftCollaborators = vi.fn()
const mockUseEditDraftHydration = vi.fn()
const mockUseEditDraftUploads = vi.fn()
const mockUseDraftEditorDerivedState = vi.fn()
const mockUseEditDraftLocationSync = vi.fn()
const mockUseEditDraftActions = vi.fn()
const mockUseDraftEditorActions = vi.fn()
const mockUseEditDraftRouteSync = vi.fn()
const mockUseDraftLocationMetadata = vi.fn()
const mockUseDraftConflictResolution = vi.fn()
const mockUseDraftRouteEditing = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}))

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: Record<string, unknown>) => T) => (
    selector(mockUseRouteStore() as Record<string, unknown>)
  ),
}))

vi.mock('@/features/media-upload/hooks/use-draft-upload-manager', () => ({
  useDraftUploadManager: () => mockUseDraftUploadManager(),
}))

vi.mock('@/features/media-upload/hooks/use-media-upload-manager', () => ({
  useMediaUploadManager: () => mockUseMediaUploadManager(),
}))

vi.mock('@/features/submissions/editor/location/use-atlas-auto-sync', () => ({
  useAtlasAutoSync: (...args: Parameters<typeof mockUseAtlasAutoSync>) => mockUseAtlasAutoSync(...args),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-data', () => ({
  useEditDraftData: () => mockUseEditDraftData(),
}))

vi.mock('@/features/draft-editor/hooks/use-draft-editor-data', () => ({
  useDraftEditorData: () => mockUseDraftEditorData(),
}))

vi.mock('@/features/collaboration/hooks/use-draft-collaborators', () => ({
  useDraftCollaborators: () => mockUseDraftCollaborators(),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-hydration', () => ({
  useEditDraftHydration: () => mockUseEditDraftHydration(),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-uploads', () => ({
  useEditDraftUploads: () => mockUseEditDraftUploads(),
}))

vi.mock('@/features/draft-editor/hooks/use-draft-editor-derived-state', () => ({
  useDraftEditorDerivedState: () => mockUseDraftEditorDerivedState(),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-location-sync', () => ({
  useEditDraftLocationSync: () => mockUseEditDraftLocationSync(),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-actions', () => ({
  useEditDraftActions: () => mockUseEditDraftActions(),
}))

vi.mock('@/features/draft-editor/hooks/use-draft-editor-actions', () => ({
  useDraftEditorActions: () => mockUseDraftEditorActions(),
}))

vi.mock('@/features/draft-editor/hooks/use-edit-draft-route-sync', () => ({
  useEditDraftRouteSync: () => mockUseEditDraftRouteSync(),
}))

vi.mock('@/features/submissions/editor/location/use-draft-location-metadata', () => ({
  useDraftLocationMetadata: () => mockUseDraftLocationMetadata(),
}))

vi.mock('@/features/draft-editor/hooks/use-draft-conflict-resolution', () => ({
  useDraftConflictResolution: () => mockUseDraftConflictResolution(),
}))

vi.mock('@/features/draft-editor/hooks/use-draft-route-editing', () => ({
  useDraftRouteEditing: () => mockUseDraftRouteEditing(),
}))

describe('useDraftEditorOrchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseSearchParams.mockReturnValue({ get: vi.fn(() => null) })
    mockUseRouteStore.mockReturnValue({
      setMode: vi.fn(),
      setInteractionTool: vi.fn(),
      reset: vi.fn(),
      clearCanvasState: vi.fn(),
      selectedRouteId: null,
      routes: [],
      setRoutes: vi.fn(),
      setSelectedRoute: vi.fn(),
      setActiveRoute: vi.fn(),
      setEditorPanelOpen: vi.fn(),
      currentPoints: [],
      interactionTool: 'draw',
      undoLastPoint: vi.fn(),
    })
    mockUseDraftUploadManager.mockReturnValue({
      uploads: [],
      hasPendingUploads: false,
      hasFailedUploads: false,
      retryUpload: vi.fn(),
      removeUpload: vi.fn(),
      registerDraftUpdatedAt: vi.fn(),
      queueDraftUploads: vi.fn(),
      resumeQueue: vi.fn(),
      isQueuePaused: false,
      subscribeToUploadComplete: vi.fn(() => vi.fn()),
    })
    mockUseMediaUploadManager.mockReturnValue({ getUploadsForCrag: vi.fn(() => []) })
    mockUseAtlasAutoSync.mockReturnValue({ atlas: null, nearbyCrag: null, loading: false, error: null })
    mockUseDraftLocationMetadata.mockReturnValue({
      showCragSelector: true,
      setShowCragSelector: vi.fn(),
      latitude: '',
      setLatitude: vi.fn(),
      longitude: '',
      setLongitude: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchingLocation: false,
      setSearchingLocation: vi.fn(),
      mapOpen: false,
      setMapOpen: vi.fn(),
      updateDraftLocation: vi.fn(),
    })
    mockUseDraftConflictResolution.mockReturnValue({ conflict: null, setConflict: vi.fn(), clearConflict: vi.fn() })
    mockUseDraftRouteEditing.mockReturnValue({ detailsOpen: false, setDetailsOpen: vi.fn(), orientationOpen: false, setOrientationOpen: vi.fn() })
    mockUseEditDraftData.mockReturnValue({
      isInitialLoading: false,
      error: null,
      draft: null,
      setDraft: vi.fn(),
      manageImages: [],
      setManageImages: vi.fn(),
      activeImageId: null,
      setActiveImageId: vi.fn(),
      defaultImageId: null,
      setDefaultImageId: vi.fn(),
      orientationByImageId: {},
      setOrientationByImageId: vi.fn(),
      routesByImageId: {},
      setRoutesByImageId: vi.fn(),
      locationModeByImageId: {},
      setLocationModeByImageId: vi.fn(),
      customGpsByImageId: {},
      setCustomGpsByImageId: vi.fn(),
      routeType: 'sport',
      setRouteType: vi.fn(),
      hasExplicitRouteType: false,
      setHasExplicitRouteType: vi.fn(),
      creditPlatform: 'instagram',
      setCreditPlatform: vi.fn(),
      creditHandle: '',
      setCreditHandle: vi.fn(),
      isAnonymousSubmission: false,
      setIsAnonymousSubmission: vi.fn(),
      cragId: null,
      setCragId: vi.fn(),
      selectedCrag: null,
      setSelectedCrag: vi.fn(),
      canvasSource: null,
      setCanvasSource: vi.fn(),
      cragCanvasImages: [],
      setCragCanvasImages: vi.fn(),
      draftUpdatedAt: '2026-04-15T13:15:49.171648+00:00',
      setDraftUpdatedAt: vi.fn(),
      isOwner: true,
      publishedCragPins: [],
      loadDraft: vi.fn(),
      syncUploadedImages: vi.fn(),
      hasHydratedLocationRef: { current: true },
      lastLocationSyncRef: { current: null },
    })
    mockUseDraftCollaborators.mockReturnValue({
      shareOpen: false,
      setShareOpen: vi.fn(),
      loadingCollaborators: false,
      collaborators: [],
      activeInvites: [],
      creatingInvite: false,
      revokingInviteId: null,
      removingCollaboratorId: null,
      latestInviteUrl: null,
      loadCollaborators: vi.fn(),
      handleCreateInvite: vi.fn(),
      handleCopyInvite: vi.fn(),
      handleRevokeInvite: vi.fn(),
      handleRemoveCollaborator: vi.fn(),
    })
    mockUseEditDraftHydration.mockReturnValue({ currentUserId: 'user-1' })
    mockUseDraftEditorData.mockReturnValue({ imagesPayload: [], imagesPayloadSignature: 'sig' })
    mockUseEditDraftUploads.mockReturnValue({
      pendingDraftUploads: [],
      queuePaused: false,
      pendingCragUploads: [],
      mergedCragCanvasImages: [],
      mergedManageImages: [],
      handleAddImages: vi.fn(),
      handleQuickBarDropFiles: vi.fn(),
      handleRemoveImage: vi.fn(),
    })
    mockUseDraftEditorDerivedState.mockReturnValue({
      activeImageTab: null,
      activeDraftImageId: null,
      activeImageLocationMode: 'shared',
      pendingActiveImageCustomPosition: null,
      activeRoutes: [],
      existingRouteLines: [],
      imageSelection: null,
      stableActiveImageUrl: '',
      activeImageReady: false,
      quickSwitcherImages: [],
      draftMapPins: [],
      publishedMapPins: [],
      effectiveMarkerPosition: [51.0978811, 0.1863465],
      effectivePublishLocation: [51.0978811, 0.1863465],
    })
    mockUseEditDraftLocationSync.mockReturnValue({
      activeImageCustomPosition: null,
      handleMapClick: vi.fn(),
      handleMarkerDragEnd: vi.fn(),
      handleSearchLocation: vi.fn(),
      flushLocationSync: vi.fn(async () => ({ ok: true })),
    })
    mockUseEditDraftActions.mockReturnValue({
      savingDraft: false,
      publishingDraft: false,
      hasPendingChanges: false,
      publishAttempted: false,
      publishValidationMessage: null,
      markMetadataDirty: vi.fn(),
      markRoutesDirty: vi.fn(),
      saveDraft: vi.fn(),
      handleDeleteDraft: vi.fn(),
      persistMetadataImmediately: vi.fn(),
      handleManualSave: vi.fn(),
      publishDraft: vi.fn(),
      handleReloadLatestDraft: vi.fn(),
    })
    mockUseDraftEditorActions.mockReturnValue({
      handleSetDefaultImage: vi.fn(),
      handleSelectCanvasSource: vi.fn(),
      handleToggleImageLocationMode: vi.fn(),
      handleSwitchImage: vi.fn(),
    })
    mockUseEditDraftRouteSync.mockReturnValue({ persistRoutesImmediately: vi.fn() })
  })

  it('resolves atlas context from the effective marker position', () => {
    renderHook(() => useDraftEditorOrchestration({ draftId: 'draft-1', addToast: vi.fn() }))

    expect(mockUseAtlasAutoSync).toHaveBeenCalledWith(51.0978811, 0.1863465)
  })
})
