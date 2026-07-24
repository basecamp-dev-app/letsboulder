// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaUploadQueueController } from '@/features/media-upload/hooks/use-media-upload-queue-controller'
import { moveQueueItemToFront, pickNextQueueClientId, resetUploadForQueue } from '@/features/media-upload/lib/media-upload-queue-state'
import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'

const uploadMocks = vi.hoisted(() => ({
  buildPreviewUrl: vi.fn(),
  createMediaUploadSession: vi.fn(),
  extractGpsFromFile: vi.fn(),
  getImageDimensions: vi.fn(),
  preprocessFile: vi.fn(),
}))

vi.mock('@/lib/image-gps', () => ({
  extractGpsFromFile: uploadMocks.extractGpsFromFile,
}))

vi.mock('@/lib/media/client-upload', () => ({
  completeMediaUploadSession: vi.fn(),
  createMediaUploadSession: uploadMocks.createMediaUploadSession,
  deleteMediaUploadSession: vi.fn(),
  uploadFileToMediaSession: vi.fn(),
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
    uploadMocks.buildPreviewUrl.mockResolvedValue('')
    uploadMocks.extractGpsFromFile.mockResolvedValue(null)
    uploadMocks.getImageDimensions.mockResolvedValue({ width: 1200, height: 900 })
    uploadMocks.preprocessFile.mockImplementation(async (file: File) => file)
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
      uploadedImageId: null,
      uploadedBucket: null,
      uploadedPath: null,
      attachedRecordId: null,
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

  it('does not restart a failed upload automatically and allows explicit retry', async () => {
    vi.useFakeTimers()
    uploadMocks.createMediaUploadSession.mockRejectedValue(new Error('Failed to create upload session'))
    const { result } = renderHook(() => useMediaUploadQueueController())
    const file = new File(['image'], 'test.jpg', { type: 'image/jpeg' })

    act(() => {
      result.current.queueUploads([file], { kind: 'draft', draftId: 'draft-1' })
    })

    await vi.waitFor(() => {
      expect(uploadMocks.createMediaUploadSession).toHaveBeenCalledTimes(1)
      expect(Object.values(result.current.uploads)[0]?.status).toBe('FAILED')
      expect(result.current.isPaused).toBe(true)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(uploadMocks.createMediaUploadSession).toHaveBeenCalledTimes(1)

    const clientId = Object.keys(result.current.uploads)[0]
    act(() => {
      result.current.retryUpload(clientId)
    })

    await vi.waitFor(() => {
      expect(uploadMocks.createMediaUploadSession).toHaveBeenCalledTimes(2)
    })
  })
})
