// @vitest-environment jsdom

import { createElement, useEffect } from 'react'
import { render, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditDraftUploads } from '@/features/draft-editor/hooks/use-edit-draft-uploads'
import type { DraftPayload, ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'

type JsonResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

const mockCsrfFetch = vi.fn()

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
}))

function createResponse(status: number, body: unknown): JsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function createDraft(): DraftPayload {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    crag_id: null,
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

function createManageImageTab(imageId: string): ManageImageTab {
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

describe('useEditDraftUploads', () => {
  beforeEach(() => {
    mockCsrfFetch.mockReset()
  })

  it('retries delete once after a self-conflict', async () => {
    const draft = createDraft()
    const setConflict = vi.fn()
    const setDraftUpdatedAt = vi.fn()
    const setRemovingImageId = vi.fn()
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const setActiveImageId = vi.fn()
    const setDefaultImageId = vi.fn()
    const setCanvasSource = vi.fn()
    const setOrientationByImageId = vi.fn()
    const setRoutesByImageId = vi.fn()
    const loadDraft = vi.fn().mockResolvedValue(undefined)
    const syncUploadedImages = vi.fn().mockResolvedValue(undefined)
    const registerDraftUpdatedAt = vi.fn()
    const removeUpload = vi.fn().mockResolvedValue(undefined)
    const manageImages = [createManageImageTab('image-1'), createManageImageTab('image-2')]
    let handleRemoveImage: ((imageId: string) => Promise<void>) | null = null

    mockCsrfFetch
      .mockResolvedValueOnce(createResponse(409, {
        code: 'draft_conflict',
        current_updated_at: '2026-04-09T10:30:00.000Z',
        current_data: {
          updated_at: '2026-04-09T10:30:00.000Z',
          last_updated_by: 'user-1',
          last_updated_by_display_name: 'Tester',
        },
      }))
      .mockResolvedValueOnce(createResponse(200, {
        success: true,
        draft: { updated_at: '2026-04-09T10:30:01.000Z', metadata: {} },
        deleted_image_id: 'image-1',
      }))

    function Harness() {
      const result = useEditDraftUploads({
        draftId: 'draft-1',
        draft,
        draftUpdatedAt: draft.updated_at,
        cragId: null,
        activeImageId: 'image-1',
        defaultImageId: 'image-1',
        canvasSource: { kind: 'draft-image', draftImageId: 'image-1' },
        addingImages: false,
        removingImageId: null,
        manageImages,
        cragCanvasImages: [],
        uploads: [],
        addImageInputRef: { current: null },
        isFetchingRef: { current: false },
        needsRefetchRef: { current: false },
        setAddingImages: vi.fn(),
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
        currentUserId: 'user-1',
        queueDraftUploads: vi.fn(),
        isQueuePaused: vi.fn(() => false),
        subscribeToUploadComplete: vi.fn(() => () => undefined),
        getUploadsForCrag: vi.fn(() => []),
        removeUpload,
      })

      useEffect(() => {
        handleRemoveImage = result.handleRemoveImage
      }, [result.handleRemoveImage])
      return null
    }

    render(createElement(Harness))

    await act(async () => {
      await handleRemoveImage?.('image-1')
    })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(2)
    expect(mockCsrfFetch).toHaveBeenNthCalledWith(1, '/api/submissions/drafts/draft-1/images/image-1?expected_updated_at=2026-04-09T10%3A21%3A41.752615%2B00%3A00', { method: 'DELETE' })
    expect(mockCsrfFetch).toHaveBeenNthCalledWith(2, '/api/submissions/drafts/draft-1/images/image-1?expected_updated_at=2026-04-09T10%3A30%3A00.000Z', { method: 'DELETE' })
    expect(setConflict).not.toHaveBeenCalled()
    expect(registerDraftUpdatedAt).toHaveBeenCalledWith('draft-1', '2026-04-09T10:30:01.000Z')
    expect(setSuccess).toHaveBeenCalledWith('Image removed from draft')
  })

  it('surfaces collaborator conflicts without retrying', async () => {
    const draft = createDraft()
    const setConflict = vi.fn()
    const setDraftUpdatedAt = vi.fn()
    const setRemovingImageId = vi.fn()
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const setActiveImageId = vi.fn()
    const setDefaultImageId = vi.fn()
    const setCanvasSource = vi.fn()
    const setOrientationByImageId = vi.fn()
    const setRoutesByImageId = vi.fn()
    const loadDraft = vi.fn().mockResolvedValue(undefined)
    const syncUploadedImages = vi.fn().mockResolvedValue(undefined)
    const registerDraftUpdatedAt = vi.fn()
    const removeUpload = vi.fn().mockResolvedValue(undefined)
    const manageImages = [createManageImageTab('image-1'), createManageImageTab('image-2')]
    let handleRemoveImage: ((imageId: string) => Promise<void>) | null = null

    mockCsrfFetch.mockResolvedValueOnce(createResponse(409, {
      code: 'draft_conflict',
      current_updated_at: '2026-04-09T10:30:00.000Z',
      current_data: {
        updated_at: '2026-04-09T10:30:00.000Z',
        last_updated_by: 'user-2',
        last_updated_by_display_name: 'Another collaborator',
      },
    }))

    function Harness() {
      const result = useEditDraftUploads({
        draftId: 'draft-1',
        draft,
        draftUpdatedAt: draft.updated_at,
        cragId: null,
        activeImageId: 'image-1',
        defaultImageId: 'image-1',
        canvasSource: { kind: 'draft-image', draftImageId: 'image-1' },
        addingImages: false,
        removingImageId: null,
        manageImages,
        cragCanvasImages: [],
        uploads: [],
        addImageInputRef: { current: null },
        isFetchingRef: { current: false },
        needsRefetchRef: { current: false },
        setAddingImages: vi.fn(),
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
        currentUserId: 'user-1',
        queueDraftUploads: vi.fn(),
        isQueuePaused: vi.fn(() => false),
        subscribeToUploadComplete: vi.fn(() => () => undefined),
        getUploadsForCrag: vi.fn(() => []),
        removeUpload,
      })

      useEffect(() => {
        handleRemoveImage = result.handleRemoveImage
      }, [result.handleRemoveImage])
      return null
    }

    render(createElement(Harness))

    await act(async () => {
      await handleRemoveImage?.('image-1')
    })

    expect(mockCsrfFetch).toHaveBeenCalledTimes(1)
    expect(setConflict).toHaveBeenCalledWith(expect.objectContaining({
      serverUpdatedAt: '2026-04-09T10:30:00.000Z',
      lastEditorName: 'Another collaborator',
    }))
    expect(registerDraftUpdatedAt).not.toHaveBeenCalled()
  })
})
