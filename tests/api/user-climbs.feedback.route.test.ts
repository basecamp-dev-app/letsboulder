import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  createRateLimitResponse: vi.fn(() => null),
}))

vi.mock('@/lib/climbs/effective-climb', () => ({
  resolveEffectiveClimbId: vi.fn(async () => 'climb-1'),
}))

import { PUT } from '@/app/api/user-climbs/feedback/route'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeFeedbackRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/user-climbs/feedback', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

describe('PUT /api/user-climbs/feedback', () => {
  test('applies consensus grade when enough logged voters agree', async () => {
    const supabaseMock = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
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

    vi.mocked(createServerClient).mockReturnValue(supabaseMock as never)

    const response = await PUT(makeFeedbackRequest({
      climbId: 'climb-1',
      gradeOpinion: 'hard',
      starRating: 4,
    }))

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.gradeUpdated).toBe(true)
    expect(json.updatedGrade).toBe('6B+')
    expect(json.consensus.targetGrade).toBe('6B+')
    expect(json.consensus.applied).toBe(true)
  })
})
