// @vitest-environment jsdom

import { createElement, useEffect, type ReactNode } from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import { useEditDraftActions } from '@/features/draft-editor/hooks/use-edit-draft-actions'
import type { DraftSaveCoordination } from '@/features/draft-editor/hooks/use-edit-draft-location-sync'
import type { DraftPayload, DraftRoute, ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'

const mockPush = vi.fn()
const mockCsrfFetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
}))

vi.mock('@/features/legal/hooks/use-open-data-consent', () => ({
  useOpenDataConsent: () => ({
    requireConsent: async (intent: () => void | Promise<void>) => intent(),
  }),
}))

function createDraft(): DraftPayload {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    crag_id: 'crag-1',
    status: 'draft',
    updated_at: '2026-04-09T10:21:41.752615+00:00',
    last_edited_by: 'user-1',
    metadata: {},
    crags: null,
    images: [
      {
        id: 'image-1',
        display_order: 0,
        route_data: {},
        storage_bucket: 'private-bucket',
        storage_path: 'images/originals/upload-1/image-1.jpg',
        readiness_status: 'ready',
        width: 1200,
        height: 900,
        latitude: null,
        longitude: null,
      },
      {
        id: 'image-2',
        display_order: 1,
        route_data: {},
        storage_bucket: 'private-bucket',
        storage_path: 'images/originals/upload-1/image-2.jpg',
        readiness_status: 'ready',
        width: 1200,
        height: 900,
        latitude: null,
        longitude: null,
      },
    ],
  }
}

function createManageImage(imageId: string): ManageImageTab {
  return {
    imageId,
    sourceKind: 'draft-image',
    index: 0,
    label: imageId,
    signedUrl: 'https://example.com/image.jpg',
    latitude: null,
    longitude: null,
  }
}

function createRoute(): DraftRoute {
  return {
    id: 'route-1',
    name: 'Test route',
    grade: 'V3',
    points: [],
    sequenceOrder: 0,
    imageWidth: 1200,
    imageHeight: 900,
  }
}

function createQueryWrapper() {
  const queryClient = new QueryClient()

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function createActionsParams(overrides: Partial<Parameters<typeof useEditDraftActions>[0]> = {}): Parameters<typeof useEditDraftActions>[0] {
  const draft = createDraft()
  return {
    draftId: draft.id,
    draft,
    draftUpdatedAt: draft.updated_at,
    currentUserId: 'user-1',
    isOwner: true,
    routeType: 'boulder',
    creditPlatform: 'instagram',
    creditHandle: '',
    isAnonymousSubmission: false,
    cragId: 'crag-1',
    sectorId: null,
    canvasSource: null,
    defaultImageId: 'image-1',
    manageImages: [createManageImage('image-1'), createManageImage('image-2')],
    routesByImageId: { 'image-1': [{ ...createRoute(), climbType: 'boulder' }], 'image-2': [] },
    orientationByImageId: {},
    locationModeByImageId: {},
    customGpsByImageId: {},
    markerPosition: [51.5, -0.1],
    cragSectionRef: { current: null },
    locationSectionRef: { current: null },
    hasPendingUploads: () => false,
    hasFailedUploads: () => false,
    hasValidLocation: true,
    flushLocationSync: vi.fn().mockResolvedValue({ ok: true }),
    loadDraft: vi.fn().mockResolvedValue(undefined),
    loadCollaborators: vi.fn().mockResolvedValue(undefined),
    addToast: vi.fn(),
    setDraft: vi.fn(),
    setDraftUpdatedAt: vi.fn(),
    setError: vi.fn(),
    setSuccess: vi.fn(),
    setConflict: vi.fn(),
    setActiveImageId: vi.fn(),
    ...overrides,
  }
}

describe('useEditDraftActions', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockCsrfFetch.mockReset()
  })

  it('flushes draft location before publishing', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: true })
    const draft = createDraft()
    const queryClient = new QueryClient()
    queryClient.setQueryData(cragKeys.images('crag-1'), { images: [] })
    queryClient.setQueryData(cragKeys.routes('crag-1'), { routes: [] })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    let publishDraft: (() => Promise<unknown>) | null = null

    mockCsrfFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: {
            updated_at: '2026-04-12T21:15:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          published: {
            defaultImageId: 'image-1',
            canonicalPath: '/test/crag/i/image-1',
            imageIds: ['image-1', 'image-2'],
            routeLineIds: ['route-line-1'],
          },
        }),
      })

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [createRoute()], 'image-2': [createRoute()] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: true,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast: vi.fn(),
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(flushLocationSync).toHaveBeenCalledTimes(1)
    expect(mockCsrfFetch).toHaveBeenCalledTimes(2)
    expect(flushLocationSync.mock.invocationCallOrder[0]).toBeLessThan(mockCsrfFetch.mock.invocationCallOrder[0])
    expect(mockCsrfFetch).toHaveBeenNthCalledWith(1, '/api/submissions/drafts/draft-1', expect.objectContaining({ method: 'PATCH' }))
    expect(mockCsrfFetch).toHaveBeenNthCalledWith(2, '/api/submissions/drafts/draft-1/publish', expect.objectContaining({ method: 'POST' }))
    expect(queryClient.getQueryState(cragKeys.images('crag-1'))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(cragKeys.routes('crag-1'))?.isInvalidated).toBe(true)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: cragKeys.images('crag-1') })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: cragKeys.routes('crag-1') })
    expect(invalidateQueries.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
    expect(mockPush).toHaveBeenCalledWith('/test/crag/i/image-1?publishedImages=2&publishedRoutes=1')
  })

  it('submits unpublished-crag content for review without opening a public route', async () => {
    const addToast = vi.fn()
    mockCsrfFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ draft: { updated_at: '2026-04-12T21:15:00.000Z' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          publication: { state: 'pending_crag_review', cragId: 'crag-1' },
          published: {
            defaultImageId: 'image-1',
            canonicalPath: null,
            imageIds: ['image-1'],
            routeLineIds: ['route-line-1'],
          },
        }),
      })

    const { result } = renderHook(
      () => useEditDraftActions(createActionsParams({ addToast })),
      { wrapper: createQueryWrapper() },
    )

    await act(async () => {
      await result.current.publishDraft()
    })

    expect(addToast).toHaveBeenCalledWith(
      'Submitted for review. Routes and images will appear after the crag is published.',
      'success',
    )
    expect(mockPush).toHaveBeenCalledWith('/logbook')
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/i/image-1'))
  })

  it('stops publishing when the location flush fails', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: false, reason: 'failed' })
    const draft = createDraft()
    let publishDraft: (() => Promise<unknown>) | null = null

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [createRoute()], 'image-2': [createRoute()] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: true,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast: vi.fn(),
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(createQueryWrapper(), null, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(flushLocationSync).toHaveBeenCalledTimes(1)
    expect(mockCsrfFetch).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('publishes on first click when location is pending local sync', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: true })
    const draft = createDraft()
    let publishDraft: (() => Promise<unknown>) | null = null

    mockCsrfFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: {
            updated_at: '2026-04-12T21:15:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          published: {
            defaultImageId: 'image-1',
            canonicalPath: '/test/crag/i/image-1',
            imageIds: ['image-1', 'image-2'],
            routeLineIds: ['route-line-1'],
          },
        }),
      })

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [createRoute()], 'image-2': [createRoute()] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: false,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast: vi.fn(),
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(createQueryWrapper(), null, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(flushLocationSync).toHaveBeenCalledTimes(1)
    expect(mockCsrfFetch).toHaveBeenCalledTimes(2)
    expect(mockPush).toHaveBeenCalledWith('/test/crag/i/image-1?publishedImages=2&publishedRoutes=1')
  })

  it('forces a draft metadata save before publish even when nothing is marked dirty', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: true })
    const draft = createDraft()
    let publishDraft: (() => Promise<unknown>) | null = null

    mockCsrfFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: {
            updated_at: '2026-04-12T21:15:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          published: {
            defaultImageId: 'image-1',
            canonicalPath: '/test/crag/i/image-1',
            imageIds: ['image-1', 'image-2'],
            routeLineIds: ['route-line-1'],
          },
        }),
      })

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [createRoute()], 'image-2': [createRoute()] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: true,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast: vi.fn(),
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(createQueryWrapper(), null, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(mockCsrfFetch).toHaveBeenNthCalledWith(1,
      '/api/submissions/drafts/draft-1',
      expect.objectContaining({ method: 'PATCH' })
    )
    expect(mockCsrfFetch).toHaveBeenNthCalledWith(2,
      '/api/submissions/drafts/draft-1/publish',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('publishes image-only drafts without blocking on empty route sets', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: true })
    const addToast = vi.fn()
    const draft = createDraft()
    let publishDraft: (() => Promise<unknown>) | null = null

    mockCsrfFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          draft: {
            updated_at: '2026-04-12T21:15:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          published: {
            defaultImageId: 'image-1',
            canonicalPath: '/test/crag/i/image-1',
            imageIds: ['image-1', 'image-2'],
            routeLineIds: [],
          },
        }),
      })

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [], 'image-2': [] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: true,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast,
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(createQueryWrapper(), null, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(2)
    expect(addToast).toHaveBeenCalledWith('Success! Published 2 images without routes yet. The community can add topo later.', 'success')
    expect(mockPush).toHaveBeenCalledWith('/test/crag/i/image-1?publishedImages=2&publishedRoutes=0')
  })

  it('shows a save rate limit error when location sync is rate limited before publish', async () => {
    const flushLocationSync = vi.fn().mockResolvedValue({ ok: false, reason: 'rate_limited' })
    const draft = createDraft()
    const addToast = vi.fn()
    const setError = vi.fn()
    let publishDraft: (() => Promise<unknown>) | null = null

    function Harness() {
      const result = useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: null,
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1'), createManageImage('image-2')],
        routesByImageId: { 'image-1': [createRoute()], 'image-2': [createRoute()] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: false,
        flushLocationSync,
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast,
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError,
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
      })

      useEffect(() => {
        publishDraft = result.publishDraft
      }, [result.publishDraft])

      return null
    }

    render(createElement(createQueryWrapper(), null, createElement(Harness)))

    await act(async () => {
      await publishDraft?.()
    })

    expect(mockCsrfFetch).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith('You are saving too quickly right now. Please wait a moment and try again before publishing.')
    expect(addToast).toHaveBeenCalledWith('You are saving too quickly right now. Please wait a moment and try again before publishing.', 'error')
  })

  it('does not clear a newer local checkpoint created during a save', async () => {
    const draft = createDraft()
    const clearCheckpointAfterSave = vi.fn().mockResolvedValue(undefined)
    let checkpointRevision = 1
    let resolveSave!: (response: unknown) => void

    mockCsrfFetch.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))

    const { result } = renderHook(() => useEditDraftActions({
        draftId: draft.id,
        draft,
        draftUpdatedAt: draft.updated_at,
        currentUserId: 'user-1',
        isOwner: true,
        routeType: 'boulder',
        creditPlatform: 'instagram',
        creditHandle: '',
        isAnonymousSubmission: false,
        cragId: 'crag-1',
        sectorId: 'sector-1',
        canvasSource: null,
        defaultImageId: 'image-1',
        manageImages: [createManageImage('image-1')],
        routesByImageId: { 'image-1': [] },
        orientationByImageId: {},
        locationModeByImageId: {},
        customGpsByImageId: {},
        markerPosition: [51.5, -0.1],
        cragSectionRef: { current: null },
        locationSectionRef: { current: null },
        hasPendingUploads: () => false,
        hasFailedUploads: () => false,
        hasValidLocation: true,
        flushLocationSync: vi.fn().mockResolvedValue({ ok: true }),
        loadDraft: vi.fn().mockResolvedValue(undefined),
        loadCollaborators: vi.fn().mockResolvedValue(undefined),
        addToast: vi.fn(),
        setDraft: vi.fn(),
        setDraftUpdatedAt: vi.fn(),
        setError: vi.fn(),
        setSuccess: vi.fn(),
        setConflict: vi.fn(),
        setActiveImageId: vi.fn(),
        getCheckpointRevision: () => checkpointRevision,
        clearCheckpointAfterSave,
      }), { wrapper: createQueryWrapper() })

    act(() => { result.current.markMetadataDirty() })
    const saving = result.current.saveDraft()
    act(() => {
      checkpointRevision = 2
      result.current.markMetadataDirty()
    })
    resolveSave?.({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-07-29T10:00:00.000Z' } }),
    })

    await act(async () => { await saving })
    expect(clearCheckpointAfterSave).not.toHaveBeenCalled()
  })

  it('sends dirty route sets in one PATCH request', async () => {
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-08-11T10:00:00.000Z' } }),
    })
    const { result } = renderHook(() => useEditDraftActions(createActionsParams()), { wrapper: createQueryWrapper() })

    act(() => { result.current.markRoutesDirty(['image-1']) })
    await act(async () => { await result.current.saveDraft() })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(mockCsrfFetch).toHaveBeenCalledWith('/api/submissions/drafts/draft-1', expect.objectContaining({ method: 'PATCH' }))
    const request = mockCsrfFetch.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(request.body)) as { routeSets: Array<{ draftImageId: string; routes: DraftRoute[] }>; metadata: unknown; cragId: string | null }
    expect(body.routeSets).toEqual([{ draftImageId: 'image-1', routes: [{ ...createRoute(), climbType: 'boulder' }] }])
    expect(body.metadata).toBeTruthy()
    expect(body.cragId).toBe('crag-1')
  })

  it('waits for location sync and uses its authoritative revision', async () => {
    const coordinationRef: { current: DraftSaveCoordination } = {
      current: { explicitSaveActive: false, locationSyncPromise: null, authoritativeUpdatedAt: createDraft().updated_at },
    }
    let resolveLocation!: (value: { ok: true; updatedAt: string }) => void
    const flushLocationSync = vi.fn(() => new Promise<{ ok: true; updatedAt: string }>((resolve) => { resolveLocation = resolve }))
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ draft: { updated_at: '2026-08-13T10:00:02.000Z' } }),
    })
    const { result } = renderHook(() => useEditDraftActions(createActionsParams({ flushLocationSync, saveCoordinationRef: coordinationRef })), { wrapper: createQueryWrapper() })

    act(() => { result.current.markMetadataDirty() })
    const saving = result.current.saveDraft()
    expect(coordinationRef.current.explicitSaveActive).toBe(true)
    expect(mockCsrfFetch).not.toHaveBeenCalled()

    resolveLocation({ ok: true, updatedAt: '2026-08-13T10:00:01.000Z' })
    await act(async () => { await saving })

    const request = mockCsrfFetch.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body)).expected_updated_at).toBe('2026-08-13T10:00:01.000Z')
    expect(coordinationRef.current.explicitSaveActive).toBe(false)
  })

  it('keeps routes in the copied unsaved payload after a collaborator conflict', async () => {
    const setConflict = vi.fn()
    mockCsrfFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_updated_at: '2026-08-11T10:00:00.000Z',
        current_data: { updated_at: '2026-08-11T10:00:00.000Z', last_updated_by: 'user-2', last_updated_by_display_name: 'Alex' },
      }),
    })
    const { result } = renderHook(() => useEditDraftActions(createActionsParams({ setConflict })), { wrapper: createQueryWrapper() })

    act(() => { result.current.markRoutesDirty(['image-1']) })
    await act(async () => { await result.current.saveDraft() })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(setConflict).toHaveBeenCalledWith(expect.objectContaining({
      serverUpdatedAt: '2026-08-11T10:00:00.000Z',
      lastEditorName: 'Alex',
      pendingChanges: expect.objectContaining({
        routeSets: [{ draftImageId: 'image-1', routes: [{ ...createRoute(), climbType: 'boulder' }] }],
      }),
    }))
  })

  it('does not retry an atomic conflict from another session of the same user', async () => {
    const setConflict = vi.fn()
    mockCsrfFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_updated_at: '2026-08-11T10:00:00.000Z',
        current_data: { updated_at: '2026-08-11T10:00:00.000Z', last_updated_by: 'user-1', last_updated_by_display_name: 'Current User' },
      }),
    })
    const { result } = renderHook(() => useEditDraftActions(createActionsParams({ setConflict })), { wrapper: createQueryWrapper() })

    act(() => { result.current.markRoutesDirty(['image-1']) })
    await act(async () => { await result.current.saveDraft() })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(setConflict).toHaveBeenCalledWith(expect.objectContaining({
      serverUpdatedAt: '2026-08-11T10:00:00.000Z',
      lastEditorName: 'Current User',
    }))
  })

})
