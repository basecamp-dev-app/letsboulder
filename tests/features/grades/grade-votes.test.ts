import { describe, expect, test, vi } from 'vitest'

import { loadGradeDistribution, upsertGradeVote } from '@/features/grades/lib/grade-votes'

describe('grade votes', () => {
  test('upserts consensus votes by climb and user', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn(() => ({ upsert }))

    await upsertGradeVote({
      supabase: { from } as never,
      entityId: 'climb-1',
      userId: 'user-1',
      grade: '6B',
    })

    expect(from).toHaveBeenCalledWith('grade_votes')
    expect(upsert).toHaveBeenCalledWith(
      { climb_id: 'climb-1', user_id: 'user-1', grade: '6B' },
      { onConflict: 'climb_id,user_id' }
    )
  })

  test('loads consensus distribution from grade votes', async () => {
    const eq = vi.fn(async () => ({
      data: [{ grade: '6B' }, { grade: '6B' }, { grade: '6A' }],
      error: null,
    }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const result = await loadGradeDistribution({
      supabase: { from } as never,
      entityId: 'climb-1',
    })

    expect(from).toHaveBeenCalledWith('grade_votes')
    expect(eq).toHaveBeenCalledWith('climb_id', 'climb-1')
    expect(result).toEqual({
      voteCount: 3,
      distribution: [{ grade: '6B', vote_count: 2 }, { grade: '6A', vote_count: 1 }],
      consensusGrade: '6B',
      error: null,
    })
  })
})
