import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/slug', () => ({
  fetchUsedSlugs: vi.fn(async () => new Set<string>()),
  makeUniqueSlug: vi.fn((name: string) => name.toLowerCase().replaceAll(' ', '-')),
}))
vi.mock('@/features/community/lib/contributor-score', () => ({
  recordAcceptedWikiContribution: vi.fn(async () => undefined),
}))

import { createSubmissionRoutes } from '@/features/submissions/server/submissions/create-submission-routes'
import type { SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

const routes = [
  {
    name: 'Boulder line',
    grade: '6A',
    climbType: 'boulder',
    points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
    sequenceOrder: 0,
    imageWidth: 1200,
    imageHeight: 800,
  },
  {
    name: 'Trad line',
    grade: '6B',
    climbType: 'trad',
    points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }],
    sequenceOrder: 1,
    imageWidth: 1200,
    imageHeight: 800,
  },
]

describe('createSubmissionRoutes', () => {
  beforeEach(() => vi.clearAllMocks())

  test('persists each new route with its selected climb type', async () => {
    const climbsInsert = vi.fn(() => ({
      select: vi.fn(async () => ({ data: [{ id: 'climb-1' }, { id: 'climb-2' }], error: null })),
    }))
    const routeLinesInsert = vi.fn(() => ({
      select: vi.fn(async () => ({ data: [{ id: 'line-1' }, { id: 'line-2' }], error: null })),
    }))
    const userClient = {
      from: vi.fn((table: string) => {
        if (table === 'images') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'image-1', created_by: 'owner-1', crag_id: 'crag-1' }, error: null })),
              })),
            })),
          }
        }
        if (table === 'route_lines') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          }
        }
        if (table === 'crags') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { slug: 'test-crag', country_code: 'GB' }, error: null })),
              })),
            })),
          }
        }
        throw new Error(`Unexpected user table: ${table}`)
      }),
      rpc: vi.fn(async (name: string) => ({ data: name === 'user_can_wiki_edit_submission' ? true : null, error: null })),
    }
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === 'climbs') return { insert: climbsInsert }
        if (table === 'route_lines') return { insert: routeLinesInsert }
        if (table === 'grade_votes') return { upsert: vi.fn(async () => ({ error: null })) }
        if (table === 'images') return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) }
        throw new Error(`Unexpected admin table: ${table}`)
      }),
    }

    const response = await createSubmissionRoutes({
      supabase: userClient as unknown as SubmissionRouteMutationDeps['supabase'],
      supabaseAdmin: adminClient as unknown as SubmissionRouteMutationDeps['supabaseAdmin'],
      userId: 'editor-1',
      imageId: 'image-1',
    }, { routes })

    expect(response.status).toBe(200)
    expect(climbsInsert).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Boulder line', route_type: 'boulder' }),
      expect.objectContaining({ name: 'Trad line', route_type: 'trad' }),
    ])
  })
})
