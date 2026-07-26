import { describe, expect, it, vi } from 'vitest'
import { fetchSavedClimbs, fetchSavedCrags } from '@/features/saved/lib/queries'

function createFailedListQuery(error: Error) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: null, error })),
      })),
    })),
  }
}

describe('saved item queries', () => {
  it('throws saved climb query errors', async () => {
    const queryError = new Error('saved climbs unavailable')
    const supabase = { from: vi.fn(() => createFailedListQuery(queryError)) }

    await expect(fetchSavedClimbs(supabase as never, 'user-1')).rejects.toBe(queryError)
  })

  it('throws saved crag query errors', async () => {
    const queryError = new Error('saved crags unavailable')
    const supabase = { from: vi.fn(() => createFailedListQuery(queryError)) }

    await expect(fetchSavedCrags(supabase as never, 'user-1')).rejects.toBe(queryError)
  })
})
