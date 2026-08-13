import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'
import { claimCollaboratorInvite, createCollaboratorInvite, loadActiveInvites, removeCollaborator, revokeCollaboratorInvite } from '@/features/submissions/server/collaboration/shared-collaborators'

const draftCollaboratorConfig = {
  resourceTable: 'submission_drafts' as const,
  resourceIdColumn: 'id' as const,
  ownerColumn: 'user_id' as const,
  collaboratorTable: 'submission_draft_collaborators' as const,
  collaboratorResourceColumn: 'draft_id' as const,
  inviteTable: 'submission_draft_collaborator_invites' as const,
  inviteResourceColumn: 'draft_id' as const,
  claimInviteRpc: 'claim_submission_draft_collaborator_invite' as const,
  successRedirectPath: (resourceId: string) => `/logbook/drafts/${resourceId}/edit?collab=added`,
  notFoundLabel: 'Draft',
  removeErrorMessage: 'Remove draft collaborator error',
  accessDeniedMessage: 'You do not have access to this draft',
  createInviteErrorMessage: 'Create draft invite error',
  revokeInviteErrorMessage: 'Revoke draft invite error',
  createInviteForbiddenMessage: 'Only the draft owner can create invites',
  revokeInviteForbiddenMessage: 'Only the draft owner can revoke invites',
  shareForbiddenMessage: 'Only draft submissions can be shared',
  profileSelect: 'id, username, display_name, avatar_url, first_name, last_name',
  createInvitePath: (token: string, origin: string) => `${origin}/collaborate/draft/${token}`,
}

export async function listDraftCollaborators(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
}) {
  const { supabase, draftId, userId } = input
  const { data: resource, error: resourceError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status')
    .eq('id', draftId)
    .maybeSingle()

  if (resourceError) return createErrorResponse(resourceError, 'Load collaborators error')
  if (!resource) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  const isOwner = resource.user_id === userId
  if (!isOwner) {
    const { data: accessRow, error: accessError } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id')
      .eq('draft_id', draftId)
      .eq('user_id', userId)
      .maybeSingle()

    if (accessError) return createErrorResponse(accessError, 'Load collaborators error')
    if (!accessRow) return NextResponse.json({ error: 'You do not have access to this draft' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('list_submission_draft_collaborators', {
    p_draft_id: draftId,
  })

  if (error) return createErrorResponse(error, 'Load collaborators error')
  const collaboratorRows = parseDraftCollaboratorRows(data)
  if (!collaboratorRows) return createErrorResponse(new Error('Invalid draft collaborator response'), 'Load collaborators error')

  let activeInvites: InviteItem[] = []
  if (isOwner) {
    const { invites, error: inviteError } = await loadActiveInvites({
      supabase,
      resourceId: draftId,
      config: draftCollaboratorConfig,
    })
    if (inviteError) return createErrorResponse(inviteError, 'Load collaborators error')
    activeInvites = invites
  }

  const collaborators: CollaboratorItem[] = collaboratorRows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    profile: {
      displayName: resolveDraftCollaboratorLabel(row),
      username: row.username,
      avatarUrl: row.avatar_url,
    },
  }))

  return NextResponse.json({
    owner: {
      userId: resource.user_id,
      profile: {
        displayName: `user_${resource.user_id.slice(0, 8)}`,
        username: null,
        avatarUrl: null,
      },
    },
    collaborators,
    isOwner,
    draftStatus: resource.status,
    activeInvites,
  })
}

interface DraftCollaboratorRpcRow {
  user_id: string
  role: string
  created_at: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function parseDraftCollaboratorRows(value: unknown): DraftCollaboratorRpcRow[] | null {
  if (!Array.isArray(value)) return null

  const rows: DraftCollaboratorRpcRow[] = []
  for (const valueRow of value) {
    if (!valueRow || typeof valueRow !== 'object') return null
    const row = valueRow as Record<string, unknown>
    if (
      typeof row.user_id !== 'string' ||
      typeof row.role !== 'string' ||
      typeof row.created_at !== 'string' ||
      !isNullableString(row.display_name) ||
      !isNullableString(row.username) ||
      !isNullableString(row.avatar_url)
    ) return null

    rows.push({
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at,
      display_name: row.display_name,
      username: row.username,
      avatar_url: row.avatar_url,
    })
  }

  return rows
}

function resolveDraftCollaboratorLabel(row: DraftCollaboratorRpcRow): string {
  return row.display_name || row.username || `user_${row.user_id.slice(0, 8)}`
}

export async function createDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
  requestBody: unknown
  origin: string
}) {
  const { supabase, draftId, userId, requestBody, origin } = input
  return createCollaboratorInvite({
    supabase,
    resourceId: draftId,
    userId,
    requestBody,
    origin,
    config: draftCollaboratorConfig,
    requireDraftStatus: true,
  })
}

export async function revokeDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
  requestBody: unknown
}) {
  const { supabase, draftId, userId, requestBody } = input
  return revokeCollaboratorInvite({
    supabase,
    resourceId: draftId,
    userId,
    requestBody,
    config: draftCollaboratorConfig,
  })
}

export async function removeDraftCollaborator(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  collaboratorUserId: string
  requesterId: string
}) {
  const { supabase, draftId, collaboratorUserId, requesterId } = input
  return removeCollaborator({
    supabase,
    resourceId: draftId,
    collaboratorUserId,
    requesterId,
    config: draftCollaboratorConfig,
    requireDraftStatus: true,
  })
}

export async function claimDraftInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  token: string
}) {
  const { supabase, token } = input
  return claimCollaboratorInvite({
    supabase,
    token,
    config: draftCollaboratorConfig,
  })
}
