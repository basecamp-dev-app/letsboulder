import { describe, expect, test, vi } from 'vitest'
import { autoPublishCreatedCrag } from '@/features/submissions/server/drafts/auto-publish-created-crag'

type DraftSupabaseClient = Parameters<typeof autoPublishCreatedCrag>[0]['supabase']

function makeSupabase(input: {
  createdBy?: string | null
  publicationStatus?: 'review' | 'published' | 'draft'
  deletedAt?: string | null
  supersededBy?: string | null
  publicationError?: unknown | null
} = {}) {
  const crag = {
    id: 'crag-1',
    created_by: input.createdBy === undefined ? 'user-1' : input.createdBy,
    publication_status: input.publicationStatus || 'review',
    deleted_at: input.deletedAt ?? null,
    superseded_by: input.supersededBy ?? null,
  }

  const rpc = vi.fn(async () => input.publicationError
    ? { data: null, error: input.publicationError }
    : { data: 'published', error: null })

  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: crag, error: null })),
        })),
      })),
    })),
    rpc,
  }

  return { supabase, rpc }
}

describe('autoPublishCreatedCrag', () => {
  test('publishes a review crag when the publishing user created it', async () => {
    const { supabase, rpc } = makeSupabase()

    const result = await autoPublishCreatedCrag({
      supabase: supabase as unknown as DraftSupabaseClient,
      cragId: 'crag-1',
      userId: 'user-1',
    })

    expect(result).toEqual({ published: true, error: null })
    expect(rpc).toHaveBeenCalledWith('set_crag_publication_status', {
      p_crag_id: 'crag-1',
      p_status: 'published',
      p_notes: 'Automatically published with creator submission',
    })
  })

  test('leaves another users review crag pending', async () => {
    const { supabase, rpc } = makeSupabase({ createdBy: 'user-2' })

    const result = await autoPublishCreatedCrag({
      supabase: supabase as unknown as DraftSupabaseClient,
      cragId: 'crag-1',
      userId: 'user-1',
    })

    expect(result).toEqual({ published: false, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('does not republish an already public crag', async () => {
    const { supabase, rpc } = makeSupabase({ publicationStatus: 'published' })

    const result = await autoPublishCreatedCrag({
      supabase: supabase as unknown as DraftSupabaseClient,
      cragId: 'crag-1',
      userId: 'user-1',
    })

    expect(result).toEqual({ published: false, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('returns publication workflow errors to the caller', async () => {
    const publicationError = { code: '22023', message: 'Crag is not ready for publication' }
    const { supabase } = makeSupabase({ publicationError })

    const result = await autoPublishCreatedCrag({
      supabase: supabase as unknown as DraftSupabaseClient,
      cragId: 'crag-1',
      userId: 'user-1',
    })

    expect(result).toEqual({ published: false, error: publicationError })
  })
})
