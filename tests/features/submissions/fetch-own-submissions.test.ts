import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'

describe('fetchOwnSubmissions', () => {
  test('counts published routes from route_lines linked to submission images', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                or: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({
                      data: [
                        {
                          id: 'canonical-image',
                          url: 'https://example.com/canonical.jpg',
                          created_at: '2026-04-08T10:00:00Z',
                          submission_id: 'submission-1',
                          moderation_status: 'approved',
                          is_anonymous_submission: false,
                          contribution_credit_platform: null,
                          contribution_credit_handle: null,
                          crags: { name: 'Test Crag', slug: 'test-crag', country_code: 'GB' },
                          route_lines: [],
                        },
                        {
                          id: 'face-image',
                          url: 'https://example.com/face.jpg',
                          created_at: '2026-04-08T10:05:00Z',
                          submission_id: 'submission-1',
                          moderation_status: 'approved',
                          is_anonymous_submission: false,
                          contribution_credit_platform: null,
                          contribution_credit_handle: null,
                          crags: { name: 'Test Crag', slug: 'test-crag', country_code: 'GB' },
                          route_lines: [],
                        },
                        {
                          id: 'image-only',
                          url: 'https://example.com/image-only.jpg',
                          created_at: '2026-04-08T11:00:00Z',
                          submission_id: 'submission-2',
                          moderation_status: 'approved',
                          is_anonymous_submission: false,
                          contribution_credit_platform: null,
                          contribution_credit_handle: null,
                          crags: { name: 'Photo Crag', slug: 'photo-crag', country_code: 'GB' },
                          route_lines: [],
                        },
                      ],
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          }
        }

        if (table === 'route_lines') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  { id: 'route-line-1', image_id: 'face-image', climb_id: 'climb-1' },
                  { id: 'route-line-2', image_id: 'face-image', climb_id: 'climb-2' },
                ],
                error: null,
              })),
            })),
          }
        }

        if (table === 'submission_drafts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const submissions = await fetchOwnSubmissions(supabase as unknown as SupabaseClient, 'user-1', fetch)

    expect(submissions).toHaveLength(2)
    expect(submissions.find((submission) => submission.id === 'submission-1')).toMatchObject({
      id: 'submission-1',
      canonical_image_id: 'canonical-image',
      route_image_id: 'face-image',
      route_line_id: 'route-line-1',
      climb_id: 'climb-1',
      route_lines_count: 2,
    })
    expect(submissions.find((submission) => submission.id === 'submission-2')).toMatchObject({
      canonical_image_id: 'image-only',
      crag_name: 'Photo Crag',
      route_lines_count: 0,
      image_count: 1,
    })
  })

  test('throws contribution query errors instead of returning an empty list', async () => {
    const queryError = new Error('contributions unavailable')
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: null, error: queryError })),
              })),
            })),
          })),
        })),
      })),
    }

    await expect(fetchOwnSubmissions(supabase as unknown as SupabaseClient, 'user-1', fetch)).rejects.toBe(queryError)
  })
})
