import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

vi.mock('@/lib/discord', () => ({
  notifyNewSubmission: vi.fn(async () => undefined),
}))

vi.mock('@/lib/media/config', () => ({
  getMediaModerationConfig: vi.fn(() => ({ enabled: false })),
}))

import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'
import { notifyNewSubmission } from '@/lib/discord'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

describe('promoteDraftToSubmission', () => {
  test('sends a Discord notification after publishing a draft', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'submission_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'draft-1',
                    user_id: 'user-1',
                    metadata: { location: { latitude: 49.45, longitude: -2.55 } },
                  },
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'image-1',
                    crag_id: 'crag-1',
                    crags: { name: 'Hidden Crag', country_code: 'GG', slug: 'hidden-crag' },
                    route_lines: [
                      { id: 'route-line-1', climb_id: 'climb-1', sequence_order: 0, created_at: '2026-03-01T00:00:00Z' },
                    ],
                  },
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'climbs') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => makeThenableResult({
                data: [
                  { id: 'climb-1', name: 'Test Route', grade: '6A' },
                ],
                error: null,
              })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc: vi.fn(async (fnName: string) => {
        if (fnName === 'promote_draft_to_submission') {
          return {
            data: {
              success: true,
              status: 'submitted',
              image_id: 'image-1',
              default_image_id: 'image-1',
              image_ids: ['image-1'],
              climb_ids: ['climb-1'],
              route_line_ids: ['route-line-1'],
              published_at: '2026-03-01T00:00:00Z',
            },
            error: null,
          }
        }

        return { data: null, error: null }
      }),
    }

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledWith(
      supabase,
      [{ id: 'climb-1', name: 'Test Route', grade: '6A' }],
      'Hidden Crag',
      'crag-1',
      'user-1'
    )
  })
})
