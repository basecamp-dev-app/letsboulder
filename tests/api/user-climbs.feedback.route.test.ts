import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/actions/action-auth', () => ({
  getActionAuth: vi.fn(async () => ({ success: true, data: { userId: 'user-1' } })),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClient: vi.fn(async () => null),
}))

vi.mock('@/features/climb/lib/effective-climb', () => ({
  resolveEffectiveClimbId: vi.fn(async () => 'climb-1'),
}))

import { getServerClient } from '@/lib/supabase-server'
import { saveClimbFeedbackAction } from '@/features/climb/actions/save-climb-feedback'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

describe('saveClimbFeedbackAction', () => {
  test('applies consensus grade when enough logged voters agree', async () => {
    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === 'user_climbs') {
          return {
            select: vi.fn((query: string) => {
              if (query === 'id') {
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: { id: 'log-1' }, error: null })),
                    })),
                  })),
                }
              }

              if (query === 'grade_opinion, grade_vote_baseline') {
                return {
                  eq: vi.fn(() => ({
                    not: vi.fn(() =>
                      makeThenableResult({
                        data: [
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                          { grade_opinion: 'hard', grade_vote_baseline: '6B' },
                        ],
                        error: null,
                      })
                    ),
                  })),
                }
              }

              return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) }
            }),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => makeThenableResult({ data: null, error: null })),
              })),
            })),
          }
        }

        if (table === 'climbs') {
          return {
            select: vi.fn((query: string) => {
              if (query === 'id, shared_climb_id') {
                return {
                  eq: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: 'climb-1', shared_climb_id: 'climb-1' }, error: null })),
                  })),
                }
              }

              if (query === 'grade') {
                return {
                  eq: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { grade: '6B' }, error: null })),
                  })),
                }
              }

              return { eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) }
            }),
            update: vi.fn(() => ({
              eq: vi.fn(() => makeThenableResult({ data: null, error: null })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    vi.mocked(getServerClient).mockResolvedValue(supabaseMock as never)

    const result = await saveClimbFeedbackAction({
      climbId: 'climb-1',
      gradeOpinion: 'hard',
      starRating: 4,
    })

    expect(result.success).toBe(true)
    expect(result.data?.gradeUpdated).toBe(true)
    expect(result.data?.updatedGrade).toBe('6B+')
    expect(result.data?.consensus.targetGrade).toBe('6B+')
    expect(result.data?.consensus.applied).toBe(true)
  })
})
