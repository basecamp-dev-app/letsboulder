import { describe, expect, test, vi } from 'vitest'
import { loadPlaceUserClimbs } from '@/features/community/server/load-place-climb-data'

function createQuery(rows: unknown[]) {
  const query = {
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  }
  return query
}

describe('loadPlaceUserClimbs', () => {
  test('bounds and orders both current and legacy place queries before merging', async () => {
    const currentQuery = createQuery([
      { user_id: 'user-1', climb_id: 'climb-1', style: 'top', created_at: '2026-08-25T10:00:00.000Z' },
    ])
    const legacyQuery = createQuery([
      { user_id: 'user-2', climb_id: 'climb-2', style: 'flash', created_at: '2026-08-26T10:00:00.000Z' },
    ])
    let queryIndex = 0
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => queryIndex++ === 0 ? currentQuery : legacyQuery),
      })),
    }

    const rows = await loadPlaceUserClimbs(supabase as never, 'place-1', {
      windowStart: '2026-06-27T00:00:00.000Z',
      limit: 20,
    })

    expect(currentQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(legacyQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(currentQuery.limit).toHaveBeenCalledWith(20)
    expect(legacyQuery.limit).toHaveBeenCalledWith(20)
    expect(rows.map((row) => row.climb_id)).toEqual(['climb-2', 'climb-1'])
  })
})
