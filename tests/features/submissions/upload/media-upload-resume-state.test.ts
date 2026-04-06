import { describe, expect, it } from 'vitest'
import { shouldResumeQueuedUploads } from '@/features/media-upload/lib/media-upload-resume-state'

describe('shouldResumeQueuedUploads', () => {
  it('only resumes when visible, idle, and queued items remain', () => {
    expect(shouldResumeQueuedUploads({ visibilityState: 'visible', isPaused: false, activeClientId: null, queueLength: 1 })).toBe(true)
    expect(shouldResumeQueuedUploads({ visibilityState: 'hidden', isPaused: false, activeClientId: null, queueLength: 1 })).toBe(false)
    expect(shouldResumeQueuedUploads({ visibilityState: 'visible', isPaused: true, activeClientId: null, queueLength: 1 })).toBe(false)
    expect(shouldResumeQueuedUploads({ visibilityState: 'visible', isPaused: false, activeClientId: 'client-1', queueLength: 1 })).toBe(false)
    expect(shouldResumeQueuedUploads({ visibilityState: 'visible', isPaused: false, activeClientId: null, queueLength: 0 })).toBe(false)
  })
})
