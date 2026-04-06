import { describe, expect, it } from 'vitest'
import { moveQueueItemToFront, pickNextQueueClientId, resetUploadForQueue } from '@/features/media-upload/lib/media-upload-queue-state'
import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'

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
})
