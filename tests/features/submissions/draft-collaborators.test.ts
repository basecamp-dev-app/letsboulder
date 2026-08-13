import { describe, expect, test, vi } from 'vitest'

import { listDraftCollaborators } from '@/features/submissions/server/drafts/draft-collaborators'

const DRAFT_ID = 'draft-1'
const OWNER_ID = 'owner-12345678'

function createSupabase(input: {
  rpcData: unknown
  resource?: { id: string; user_id: string; status: string } | null
  invites?: Array<{ id: string; token: string; max_uses: number | null; used_count: number; expires_at: string | null; created_at: string }>
}) {
  const rpc = vi.fn().mockResolvedValue({ data: input.rpcData, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'submission_drafts') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: input.resource ?? { id: DRAFT_ID, user_id: OWNER_ID, status: 'draft' },
              error: null,
            }),
          })),
        })),
      }
    }

    if (table === 'submission_draft_collaborators') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { draft_id: DRAFT_ID }, error: null }) })),
          })),
        })),
      }
    }

    if (table === 'submission_draft_collaborator_invites') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: input.invites ?? [], error: null }),
          })),
        })),
      }
    }

    throw new Error(`Unexpected table query: ${table}`)
  })

  return { from, rpc }
}

describe('listDraftCollaborators', () => {
  test('uses the authenticated RPC and preserves nullable private profile fields', async () => {
    const supabase = createSupabase({
      rpcData: [
        {
          user_id: 'private-12345678',
          role: 'editor',
          created_at: '2026-08-13T10:00:00.000Z',
          display_name: null,
          username: null,
          avatar_url: null,
        },
        {
          user_id: 'public-12345678',
          role: 'editor',
          created_at: '2026-08-13T11:00:00.000Z',
          display_name: 'Public climber',
          username: 'public-climber',
          avatar_url: 'https://example.test/avatar.jpg',
        },
        {
          user_id: OWNER_ID,
          role: 'editor',
          created_at: '2026-08-13T12:00:00.000Z',
          display_name: 'Owner profile',
          username: 'owner-climber',
          avatar_url: null,
        },
      ],
    })

    const response = await listDraftCollaborators({
      supabase: supabase as never,
      draftId: DRAFT_ID,
      userId: OWNER_ID,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('list_submission_draft_collaborators', { p_draft_id: DRAFT_ID })
    expect(supabase.from).toHaveBeenCalledWith('submission_drafts')
    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
    await expect(response.json()).resolves.toMatchObject({
      collaborators: [
        {
          userId: 'private-12345678',
          profile: { displayName: 'user_private-', username: null, avatarUrl: null },
        },
        {
          userId: 'public-12345678',
          profile: {
            displayName: 'Public climber',
            username: 'public-climber',
            avatarUrl: 'https://example.test/avatar.jpg',
          },
        },
        {
          userId: OWNER_ID,
          profile: { displayName: 'Owner profile', username: 'owner-climber', avatarUrl: null },
        },
      ],
      isOwner: true,
      draftStatus: 'draft',
    })
  })

  test('keeps active invites owner-only and applies existing active filtering', async () => {
    const supabase = createSupabase({
      rpcData: [],
      invites: [
        { id: 'active', token: 'active-token', max_uses: 2, used_count: 1, expires_at: null, created_at: '2026-08-13T10:00:00.000Z' },
        { id: 'used', token: 'used-token', max_uses: 1, used_count: 1, expires_at: null, created_at: '2026-08-13T09:00:00.000Z' },
      ],
    })

    const ownerResponse = await listDraftCollaborators({ supabase: supabase as never, draftId: DRAFT_ID, userId: OWNER_ID })
    await expect(ownerResponse.json()).resolves.toMatchObject({
      activeInvites: [{ id: 'active', token: 'active-token', maxUses: 2, usedCount: 1 }],
    })

    const collaboratorSupabase = createSupabase({ rpcData: [] })
    const collaboratorResponse = await listDraftCollaborators({
      supabase: collaboratorSupabase as never,
      draftId: DRAFT_ID,
      userId: 'collaborator-1',
    })
    await expect(collaboratorResponse.json()).resolves.toMatchObject({ activeInvites: [] })
    expect(collaboratorSupabase.from).not.toHaveBeenCalledWith('submission_draft_collaborator_invites')
  })
})
