import { describe, expect, it } from 'vitest'

import { toMediaStatusResponse } from '@/lib/media/media-status'

describe('toMediaStatusResponse', () => {
  it('reports skipped media ready only after it is public', () => {
    expect(toMediaStatusResponse({
      id: 'image-1',
      processing_status: 'ready',
      moderation_status: 'skipped',
      visibility: 'public',
      status: 'approved',
    }, null)).toEqual({
      imageId: 'image-1',
      processingStatus: 'ready',
      moderationStatus: 'skipped',
      retryable: false,
      errorCode: null,
    })
  })

  it('does not hide rejected or private ready states', () => {
    expect(toMediaStatusResponse({
      id: 'image-2',
      processing_status: 'ready',
      moderation_status: 'rejected',
      visibility: 'private',
      status: 'rejected',
    }, null).moderationStatus).toBe('rejected')

    expect(toMediaStatusResponse({
      id: 'image-3',
      processing_status: 'ready',
      moderation_status: 'skipped',
      visibility: 'private',
      status: 'pending',
    }, null).errorCode).toBe('MEDIA_NOT_PUBLIC')
  })
})
