// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaUploadQueueController } from '@/features/media-upload/hooks/use-media-upload-queue-controller'
import { moveQueueItemToFront, pickNextQueueClientId, resetUploadForQueue } from '@/features/media-upload/lib/media-upload-queue-state'
import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'
import { isMediaUploadPending, mapMediaUploadStatus, MEDIA_UPLOAD_STATUS_LABELS } from '@/features/media-upload/lib/upload-types'

const uploadMocks = vi.hoisted(() => ({
  buildPreviewUrl: vi.fn(),
  completeMediaUploadSession: vi.fn(),
  createMediaUploadSession: vi.fn(),
  deleteMediaUploadSession: vi.fn(),
  extractGpsFromFile: vi.fn(),
  getImageDimensions: vi.fn(),
  getMediaUploadStatus: vi.fn(),
  pollMediaUploadStatus: vi.fn(),
  preprocessFile: vi.fn(),
  uploadFileToMediaSession: vi.fn(),
}))

vi.mock('@/lib/image-gps', () => ({
  extractGpsFromFile: uploadMocks.extractGpsFromFile,
}))

vi.mock('@/lib/media/client-upload', () => ({
  completeMediaUploadSession: uploadMocks.completeMediaUploadSession,
  createMediaUploadSession: uploadMocks.createMediaUploadSession,
  deleteMediaUploadSession: uploadMocks.deleteMediaUploadSession,
  getMediaUploadStatus: uploadMocks.getMediaUploadStatus,
  pollMediaUploadStatus: uploadMocks.pollMediaUploadStatus,
  uploadFileToMediaSession: uploadMocks.uploadFileToMediaSession,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) } }),
}))

vi.mock('@/features/media-upload/lib/durable-upload-store', () => ({
  persistNewUpload: vi.fn(async () => true),
  persistUploadMetadata: vi.fn(async () => undefined),
  removePersistedUpload: vi.fn(async () => undefined),
  restoreUploads: vi.fn(async () => []),
}))

vi.mock('@/lib/media/upload-debug', () => ({
  uploadDebug: vi.fn(),
}))

vi.mock('@/features/media-upload/lib/preprocess-image', () => ({
  buildPreviewUrl: uploadMocks.buildPreviewUrl,
  getImageDimensions: uploadMocks.getImageDimensions,
  preprocessFile: uploadMocks.preprocessFile,
}))

function createUpload(overrides: Partial<MediaUploadItem> = {}): MediaUploadItem {
  return {
    clientId: 'client-1',
    target: { kind: 'draft', draftId: 'draft-1' },
    fileName: 'test.jpg',
    status: 'FAILED',
    progress: 73,
    previewUrl: 'blob:test',
    width: 1200,
    height: 900,
    uploadedImageId: 'image-1',
    uploadedBucket: 'bucket',
    uploadedPath: 'path/file.jpg',
    gpsData: { latitude: 1, longitude: 2 },
    captureDate: '2026-01-01T00:00:00.000Z',
    error: 'broken',
    attachedRecordId: 'record-1',
    startedAt: 1,
    ...overrides,
  }
}

describe('media upload queue state machine', () => {
  beforeEach(() => {
    uploadMocks.createMediaUploadSession.mockReset()
    uploadMocks.buildPreviewUrl.mockResolvedValue('')
    uploadMocks.completeMediaUploadSession.mockResolvedValue({ imageId: 'image-1', processingStatus: 'ready', moderationStatus: 'skipped', retryable: false, errorCode: null })
    uploadMocks.deleteMediaUploadSession.mockResolvedValue(undefined)
    uploadMocks.extractGpsFromFile.mockResolvedValue(null)
    uploadMocks.getImageDimensions.mockResolvedValue({ width: 1200, height: 900 })
    uploadMocks.getMediaUploadStatus.mockResolvedValue({ imageId: 'image-1', processingStatus: 'queued', moderationStatus: 'pending', retryable: false, errorCode: null, uploadCommitted: true })
    uploadMocks.pollMediaUploadStatus.mockResolvedValue({ imageId: 'image-1', processingStatus: 'ready', moderationStatus: 'skipped', retryable: false, errorCode: null })
    uploadMocks.preprocessFile.mockImplementation(async (file: File) => file)
    uploadMocks.uploadFileToMediaSession.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets a retried item back to the queued state', () => {
    const current = createUpload()

    expect(resetUploadForQueue(current)).toEqual({
      ...current,
      status: 'QUEUED',
      progress: 0,
      error: null,
    })
  })

  it('maps server lifecycle statuses and keeps processing states pending', () => {
    expect(mapMediaUploadStatus({ imageId: 'image-1', processingStatus: 'queued', moderationStatus: 'skipped', retryable: false, errorCode: null })).toBe('PROCESSING')
    expect(mapMediaUploadStatus({ imageId: 'image-1', processingStatus: 'processing', moderationStatus: 'approved', retryable: false, errorCode: null })).toBe('PROCESSING')
    expect(mapMediaUploadStatus({ imageId: 'image-1', processingStatus: 'ready', moderationStatus: 'pending', retryable: false, errorCode: null })).toBe('MODERATING')
    expect(mapMediaUploadStatus({ imageId: 'image-1', processingStatus: 'ready', moderationStatus: 'skipped', retryable: false, errorCode: null })).toBe('READY')
    expect(mapMediaUploadStatus({ imageId: 'image-1', processingStatus: 'failed', moderationStatus: 'skipped', retryable: false, errorCode: 'FAILED' })).toBe('FAILED')
    expect(isMediaUploadPending('PROCESSING')).toBe(true)
    expect(isMediaUploadPending('MODERATING')).toBe(true)
    expect(isMediaUploadPending('READY')).toBe(false)
    expect(MEDIA_UPLOAD_STATUS_LABELS).toMatchObject({
      PROCESSING: 'Uploaded, preparing photo',
      MODERATING: 'Checking photo safety',
      READY: 'Ready',
    })
  })

  it('moves a retried item to the front of the queue without duplication', () => {
    expect(moveQueueItemToFront(['a', 'b', 'c', 'b'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('skips failed or processing items and stops while paused or active', () => {
    const uploads = {
      a: createUpload({ clientId: 'a', status: 'FAILED' }),
      b: createUpload({ clientId: 'b', status: 'QUEUED' }),
      c: createUpload({ clientId: 'c', status: 'QUEUED' }),
    }

    expect(pickNextQueueClientId({
      uploads,
      queueOrder: ['a', 'b', 'c'],
      processingClientIds: new Set(['b']),
      activeClientId: null,
      isPaused: false,
    })).toBe('c')

    expect(pickNextQueueClientId({
      uploads,
      queueOrder: ['a', 'b', 'c'],
      processingClientIds: new Set(),
      activeClientId: 'b',
      isPaused: false,
    })).toBeNull()

    expect(pickNextQueueClientId({
      uploads,
      queueOrder: ['a', 'b', 'c'],
      processingClientIds: new Set(),
      activeClientId: null,
      isPaused: true,
    })).toBeNull()
  })

  it('continues after one upload fails and allows explicit retry', async () => {
    uploadMocks.createMediaUploadSession
      .mockRejectedValueOnce(new Error('Failed to create upload session'))
      .mockResolvedValue({
        imageId: 'image-1',
        objectKey: 'uploads/image-1.jpg',
        bucket: 'media',
        uploadUrl: 'https://example.com/upload',
        uploadMethod: 'PUT',
        uploadHeaders: {},
        expiresInSeconds: 300,
      })
    const { result, unmount } = renderHook(() => useMediaUploadQueueController())
    const corruptFile = new File(['bad'], 'corrupt.jpg', { type: 'image/jpeg' })
    const validFile = new File(['image'], 'valid.jpg', { type: 'image/jpeg' })

    act(() => {
      result.current.queueUploads([corruptFile, validFile], { kind: 'crag', cragId: 'crag-1' })
    })

    await vi.waitFor(() => {
      expect(uploadMocks.createMediaUploadSession).toHaveBeenCalledTimes(2)
      expect(Object.values(result.current.uploads).find((upload) => upload.fileName === 'corrupt.jpg')?.status).toBe('FAILED')
      expect(Object.values(result.current.uploads).find((upload) => upload.fileName === 'valid.jpg')?.status).toBe('READY')
    })

    expect(result.current.isPaused).toBe(false)
    expect(result.current.queueOrder).toEqual([])

    const clientId = Object.values(result.current.uploads).find((upload) => upload.fileName === 'corrupt.jpg')?.clientId
    expect(clientId).toBeDefined()
    act(() => {
      result.current.retryUpload(clientId!)
    })

    await vi.waitFor(() => {
      expect(uploadMocks.createMediaUploadSession).toHaveBeenCalledTimes(3)
      expect(result.current.uploads[clientId!]?.status).toBe('READY')
    })
    unmount()
  })
})
