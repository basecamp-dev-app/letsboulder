import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/actions/action-auth', () => ({ getActionAuth: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ getServerClient: vi.fn() }))
vi.mock('@/features/submissions/server/drafts/draft-collaborators', () => ({
  createDraftInvite: vi.fn(),
  listDraftCollaborators: vi.fn(),
  removeDraftCollaborator: vi.fn(),
  revokeDraftInvite: vi.fn(),
}))

import { getActionAuth } from '@/lib/actions/action-auth'
import { getServerClient } from '@/lib/supabase-server'
import { fetchDraftCollaboratorsAction } from '@/features/submissions/actions/collaboration-actions'
import { listDraftCollaborators } from '@/features/submissions/server/drafts/draft-collaborators'

describe('fetchDraftCollaboratorsAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('uses the authenticated server client and preserves the success shape', async () => {
    const supabase = { rpc: vi.fn() }
    vi.mocked(getActionAuth).mockResolvedValue({ success: true, data: { userId: 'user-1' } })
    vi.mocked(getServerClient).mockResolvedValue(supabase as never)
    vi.mocked(listDraftCollaborators).mockResolvedValue(NextResponse.json({
      collaborators: [{ userId: 'collaborator-1', role: 'editor', createdAt: '2026-08-13T10:00:00.000Z', profile: { displayName: 'Climber', username: null, avatarUrl: null } }],
      activeInvites: [],
    }))

    await expect(fetchDraftCollaboratorsAction('draft-1')).resolves.toEqual({
      success: true,
      data: {
        collaborators: [{ userId: 'collaborator-1', role: 'editor', createdAt: '2026-08-13T10:00:00.000Z', profile: { displayName: 'Climber', username: null, avatarUrl: null } }],
        activeInvites: [],
      },
    })
    expect(listDraftCollaborators).toHaveBeenCalledWith({ supabase, draftId: 'draft-1', userId: 'user-1' })
  })

  test('preserves draft listing errors', async () => {
    vi.mocked(getActionAuth).mockResolvedValue({ success: true, data: { userId: 'user-1' } })
    vi.mocked(getServerClient).mockResolvedValue({} as never)
    vi.mocked(listDraftCollaborators).mockResolvedValue(NextResponse.json({ error: 'Draft collaborator access denied' }, { status: 403 }))

    await expect(fetchDraftCollaboratorsAction('draft-1')).resolves.toEqual({
      success: false,
      error: 'Draft collaborator access denied',
      status: 403,
    })
  })
})
