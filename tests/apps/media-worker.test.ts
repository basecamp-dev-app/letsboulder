import { describe, expect, it, vi } from 'vitest'

import { markMediaJobsCompletedByImage } from '@/apps/media-worker/src/index'

describe('media worker durable job synchronization', () => {
  it('completes active durable jobs after queue processing', async () => {
    const inStatuses = vi.fn(async () => ({ error: null }))
    const eqImage = vi.fn(() => ({ in: inStatuses }))
    const update = vi.fn(() => ({ eq: eqImage }))
    const supabase = {
      from: vi.fn(() => ({ update })),
    }

    await markMediaJobsCompletedByImage(supabase as never, 'image-1')

    expect(supabase.from).toHaveBeenCalledWith('media_jobs')
    expect(eqImage).toHaveBeenCalledWith('image_id', 'image-1')
    expect(inStatuses).toHaveBeenCalledWith('status', ['queued', 'processing'])
    expect(update).toHaveBeenCalledWith({
      status: 'completed',
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
  })

  it('surfaces synchronization failures so the queue message retries', async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ error: new Error('database unavailable') })),
          })),
        })),
      })),
    }

    await expect(markMediaJobsCompletedByImage(supabase as never, 'image-1'))
      .rejects.toThrow('database unavailable')
  })
})
