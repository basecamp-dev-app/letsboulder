// @vitest-environment jsdom

import { createElement, useEffect } from 'react'
import { render, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useEditDraftActions } from '@/features/draft-editor/hooks/use-edit-draft-actions'
import type { DraftPayload, DraftRoute, ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'

const mockPush = vi.fn()
const mockCsrfFetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
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
        proxy_url: 'https://example.com/image-1.jpg',
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
        proxy_url: 'https://example.com/image-2.jpg',
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

describe('useEditDraftActions', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockCsrfFetch.mockReset()
  })

  it('flushes draft location before publishing', async () => {
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
        publishRequirementsRef: { current: null },
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

    render(createElement(Harness))

    await act(async () => {
      await publishDraft?.()
    })

    expect(flushLocationSync).toHaveBeenCalledTimes(1)
    expect(mockCsrfFetch).toHaveBeenCalledTimes(2)
    expect(flushLocationSync.mock.invocationCallOrder[0]).toBeLessThan(mockCsrfFetch.mock.invocationCallOrder[0])
    expect(mockPush).toHaveBeenCalledWith('/test/crag/i/image-1?publishedImages=2&publishedRoutes=1')
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
        publishRequirementsRef: { current: null },
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

    render(createElement(Harness))

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
        publishRequirementsRef: { current: null },
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

    render(createElement(Harness))

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
        publishRequirementsRef: { current: null },
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

    render(createElement(Harness))

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
        publishRequirementsRef: { current: null },
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

    render(createElement(Harness))

    await act(async () => {
      await publishDraft?.()
    })

    expect(mockCsrfFetch).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith('You are saving too quickly right now. Please wait a moment and try again before publishing.')
    expect(addToast).toHaveBeenCalledWith('You are saving too quickly right now. Please wait a moment and try again before publishing.', 'error')
  })

})
