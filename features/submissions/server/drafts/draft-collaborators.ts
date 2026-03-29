import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { resolveDraftPersonLabel, type ProfileRow } from '@/features/submissions/server/drafts/draft-route-shared'

interface DraftCollaboratorRow {
  draft_id: string
  user_id: string
  role: string
  created_at: string
}

interface ClaimDraftInviteResult {
  draft_id?: string
}

export async function listDraftCollaborators(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  readClient: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
}) {
  const { supabase, readClient, draftId, userId } = input
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) return createErrorResponse(draftError, 'Load draft collaborators error')
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  const isOwner = draft.user_id === userId
  let hasCollaboratorAccess = false
  if (!isOwner) {
    const { data: accessRow, error: accessError } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id')
      .eq('draft_id', draftId)
      .eq('user_id', userId)
      .maybeSingle()
    if (accessError) return createErrorResponse(accessError, 'Load draft collaborators error')
    hasCollaboratorAccess = !!accessRow
  }

  if (!isOwner && !hasCollaboratorAccess) {
    return NextResponse.json({ error: 'You do not have access to this draft' }, { status: 403 })
  }

  const { data: collaboratorRows, error: collaboratorError } = await supabase
    .from('submission_draft_collaborators')
    .select('draft_id, user_id, role, created_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })

  if (collaboratorError) return createErrorResponse(collaboratorError, 'Load draft collaborators error')

  const collaboratorUserIds = ((collaboratorRows || []) as DraftCollaboratorRow[])
    .map((row) => row.user_id)
    .filter((rowUserId): rowUserId is string => typeof rowUserId === 'string' && !!rowUserId)

  const profileIds = Array.from(new Set([draft.user_id, ...collaboratorUserIds]))
  let profilesById = new Map<string, ProfileRow>()

  if (profileIds.length > 0) {
    const { data: profileRows } = await readClient
      .from('profiles')
      .select('id, username, display_name, avatar_url, first_name, last_name')
      .in('id', profileIds)
    profilesById = new Map(((profileRows || []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  }

  const ownerProfile = draft.user_id ? profilesById.get(draft.user_id) || null : null
  const collaborators = ((collaboratorRows || []) as DraftCollaboratorRow[]).map((row) => {
    const profile = profilesById.get(row.user_id) || null
    return {
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      profile: {
        displayName: resolveDraftPersonLabel(profile, row.user_id),
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      },
    }
  })

  let activeInvites: Array<{
    id: string
    token: string
    maxUses: number | null
    usedCount: number
    expiresAt: string | null
    createdAt: string
  }> = []

  if (isOwner) {
    const { data: inviteRows, error: inviteError } = await supabase
      .from('submission_draft_collaborator_invites')
      .select('id, token, max_uses, used_count, expires_at, created_at')
      .eq('draft_id', draftId)
      .order('created_at', { ascending: false })

    if (inviteError) return createErrorResponse(inviteError, 'Load draft collaborators error')

    const nowIso = new Date().toISOString()
    activeInvites = (inviteRows || [])
      .filter((invite: { expires_at: string | null; max_uses: number | null; used_count: number }) => {
        if (invite.expires_at && invite.expires_at <= nowIso) return false
        if (invite.max_uses !== null && invite.used_count >= invite.max_uses) return false
        return true
      })
      .map((invite: { id: string; token: string; max_uses: number | null; used_count: number; expires_at: string | null; created_at: string }) => ({
        id: invite.id,
        token: invite.token,
        maxUses: invite.max_uses,
        usedCount: invite.used_count,
        expiresAt: invite.expires_at,
        createdAt: invite.created_at,
      }))
  }

  return NextResponse.json({
    owner: draft.user_id
      ? {
          userId: draft.user_id,
          profile: {
            displayName: resolveDraftPersonLabel(ownerProfile, draft.user_id),
            username: ownerProfile?.username || null,
            avatarUrl: ownerProfile?.avatar_url || null,
          },
        }
      : null,
    collaborators,
    isOwner,
    draftStatus: draft.status,
    activeInvites,
  })
}

export async function createDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
  requestBody: unknown
  origin: string
}) {
  const { supabase, draftId, userId, requestBody, origin } = input
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) return createErrorResponse(draftError, 'Create draft invite error')
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (draft.user_id !== userId) return NextResponse.json({ error: 'Only the draft owner can create invites' }, { status: 403 })
  if (draft.status !== 'draft') return NextResponse.json({ error: 'Only draft submissions can be shared' }, { status: 400 })

  const body = (requestBody && typeof requestBody === 'object') ? requestBody as Record<string, unknown> : {}
  const parsedMaxUses = body.maxUses
  const maxUses = parsedMaxUses === null || parsedMaxUses === undefined
    ? null
    : typeof parsedMaxUses === 'number' && Number.isInteger(parsedMaxUses) && parsedMaxUses > 0
      ? parsedMaxUses
      : null

  const parsedExpiresAt = body.expiresAt
  const expiresAt = typeof parsedExpiresAt === 'string' && parsedExpiresAt.trim() ? parsedExpiresAt : null
  if (expiresAt) {
    const parsed = new Date(expiresAt)
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid expiresAt value' }, { status: 400 })
    }
  }

  const { data: invite, error: inviteError } = await supabase
    .from('submission_draft_collaborator_invites')
    .insert({ draft_id: draftId, created_by: userId, max_uses: maxUses, expires_at: expiresAt })
    .select('id, token, max_uses, used_count, expires_at, created_at')
    .single()

  if (inviteError || !invite) return createErrorResponse(inviteError, 'Create draft invite error')
  const inviteUrl = `${origin}/api/submissions/drafts/collaborate/${invite.token}`

  return NextResponse.json({
    success: true,
    invite: {
      id: invite.id,
      token: invite.token,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
      inviteUrl,
    },
  })
}

export async function revokeDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
  requestBody: unknown
}) {
  const { supabase, draftId, userId, requestBody } = input
  const body = requestBody as { inviteId?: unknown } | null
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : ''
  if (!inviteId) return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 })

  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) return createErrorResponse(draftError, 'Revoke draft invite error')
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (draft.user_id !== userId) return NextResponse.json({ error: 'Only the draft owner can revoke invites' }, { status: 403 })

  const { error: deleteError } = await supabase
    .from('submission_draft_collaborator_invites')
    .delete()
    .eq('id', inviteId)
    .eq('draft_id', draftId)

  if (deleteError) return createErrorResponse(deleteError, 'Revoke draft invite error')
  return NextResponse.json({ success: true })
}

export async function removeDraftCollaborator(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  collaboratorUserId: string
  requesterId: string
}) {
  const { supabase, draftId, collaboratorUserId, requesterId } = input
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) return createErrorResponse(draftError, 'Remove draft collaborator error')
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (draft.status !== 'draft') return NextResponse.json({ error: 'Only draft submissions can be updated' }, { status: 400 })

  const isOwner = draft.user_id === requesterId
  const isSelfLeave = requesterId === collaboratorUserId
  if (collaboratorUserId === draft.user_id) {
    return NextResponse.json({ error: 'Owner cannot be removed from draft' }, { status: 400 })
  }
  if (!isOwner && !isSelfLeave) {
    return NextResponse.json({ error: 'Only the owner can remove collaborators' }, { status: 403 })
  }

  const { data: existingCollaborator, error: existingCollaboratorError } = await supabase
    .from('submission_draft_collaborators')
    .select('draft_id')
    .eq('draft_id', draftId)
    .eq('user_id', collaboratorUserId)
    .maybeSingle()

  if (existingCollaboratorError) return createErrorResponse(existingCollaboratorError, 'Remove draft collaborator error')
  if (!existingCollaborator) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })

  const { error: deleteError } = await supabase
    .from('submission_draft_collaborators')
    .delete()
    .eq('draft_id', draftId)
    .eq('user_id', collaboratorUserId)

  if (deleteError) return createErrorResponse(deleteError, 'Remove draft collaborator error')
  return NextResponse.json({ success: true, left: isSelfLeave && !isOwner })
}

export async function claimDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  request: Request
  token: string
  userId: string | null
  authError: unknown
}) {
  const { supabase, request, token, userId, authError } = input
  const tokenValue = typeof token === 'string' ? token.trim() : ''

  if (!tokenValue) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  if (authError || !userId) {
    const returnTo = `/api/submissions/drafts/collaborate/${encodeURIComponent(tokenValue)}`
    const authUrl = new URL(`/auth?redirect_to=${encodeURIComponent(returnTo)}`, request.url)
    return NextResponse.redirect(authUrl)
  }

  const { data, error } = await supabase.rpc('claim_submission_draft_collaborator_invite', {
    p_token: tokenValue,
  })

  if (error || !data) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  const claim = data as ClaimDraftInviteResult
  if (!claim.draft_id) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  return NextResponse.redirect(new URL(`/logbook/drafts/${claim.draft_id}/edit?collab=added`, request.url))
}
