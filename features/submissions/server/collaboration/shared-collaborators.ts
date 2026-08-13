import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'
import type { ProfileRow } from '@/features/submissions/server/drafts/draft-route-shared'

interface BaseCollaboratorConfig {
  resourceTable: 'images' | 'submission_drafts'
  resourceIdColumn: 'id'
  ownerColumn: 'created_by' | 'user_id'
  collaboratorTable: 'submission_collaborators' | 'submission_draft_collaborators'
  collaboratorResourceColumn: 'image_id' | 'draft_id'
  inviteTable: 'submission_collaborator_invites' | 'submission_draft_collaborator_invites'
  inviteResourceColumn: 'image_id' | 'draft_id'
  claimInviteRpc: 'claim_submission_collaborator_invite' | 'claim_submission_draft_collaborator_invite'
  successRedirectPath: (resourceId: string) => string
  notFoundLabel: string
  removeErrorMessage: string
  nonOwnerRemovalErrorMessage?: string
  accessDeniedMessage: string
  createInviteErrorMessage: string
  revokeInviteErrorMessage: string
  createInviteForbiddenMessage: string
  revokeInviteForbiddenMessage: string
  shareForbiddenMessage?: string
  profileSelect: string
  createInvitePath: (token: string, origin: string) => string
}

interface SharedClaimResult {
  draft_id?: string
  image_id?: string
}

type ClaimInviteConfig = Pick<BaseCollaboratorConfig, 'claimInviteRpc' | 'successRedirectPath'>

interface CollaboratorRow {
  user_id: string
  role: string
  created_at: string
}

interface InviteRow {
  id: string
  token: string
  max_uses: number | null
  used_count: number
  expires_at: string | null
  created_at: string
}

async function loadResourceOwner(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  config: BaseCollaboratorConfig
  includeStatus?: boolean
}) {
  const { supabase, resourceId, config, includeStatus = false } = input
  const selectFields = includeStatus
    ? `id, ${config.ownerColumn}, status`
    : `id, ${config.ownerColumn}`

  return supabase
    .from(config.resourceTable)
    .select(selectFields)
    .eq(config.resourceIdColumn, resourceId)
    .maybeSingle()
}

export async function loadActiveInvites(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  config: BaseCollaboratorConfig
}) {
  const { supabase, resourceId, config } = input
  const { data: inviteRows, error } = await supabase
    .from(config.inviteTable)
    .select('id, token, max_uses, used_count, expires_at, created_at')
    .eq(config.inviteResourceColumn, resourceId)
    .order('created_at', { ascending: false })

  if (error) {
    return { invites: [] as InviteItem[], error }
  }

  const nowIso = new Date().toISOString()
  const invites = ((inviteRows || []) as InviteRow[])
    .filter((invite) => {
      if (invite.expires_at && invite.expires_at <= nowIso) return false
      if (invite.max_uses !== null && invite.used_count >= invite.max_uses) return false
      return true
    })
    .map((invite) => ({
      id: invite.id,
      token: invite.token,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    }))

  return { invites, error: null }
}

function parseInviteOptions(requestBody: unknown) {
  const body = requestBody && typeof requestBody === 'object'
    ? requestBody as Record<string, unknown>
    : {}

  const parsedMaxUses = body.maxUses
  const maxUses = parsedMaxUses === null || parsedMaxUses === undefined
    ? null
    : typeof parsedMaxUses === 'number' && Number.isInteger(parsedMaxUses) && parsedMaxUses > 0
      ? parsedMaxUses
      : null

  const parsedExpiresAt = body.expiresAt
  const expiresAt = typeof parsedExpiresAt === 'string' && parsedExpiresAt.trim() ? parsedExpiresAt : null

  return { maxUses, expiresAt }
}

function mapProfilesById(rows: ProfileRow[] | null) {
  return new Map((rows || []).map((profile) => [profile.id, profile]))
}

function mapCollaborators(
  rows: CollaboratorRow[],
  profilesById: Map<string, ProfileRow>,
  resolveDisplayName: (profile: ProfileRow | null, userId: string) => string
): CollaboratorItem[] {
  return rows.map((row) => {
    const profile = profilesById.get(row.user_id) || null
    return {
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      profile: {
        displayName: resolveDisplayName(profile, row.user_id),
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      },
    }
  })
}

export async function listCollaborators(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  readClient: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  userId: string
  config: BaseCollaboratorConfig
  resolveDisplayName: (profile: ProfileRow | null, userId: string) => string
}) {
  const { supabase, readClient, resourceId, userId, config, resolveDisplayName } = input
  const { data: resource, error: resourceError } = await loadResourceOwner({
    supabase,
    resourceId,
    config,
    includeStatus: config.resourceTable === 'submission_drafts',
  })

  if (resourceError) return createErrorResponse(resourceError, 'Load collaborators error')
  if (!resource) return NextResponse.json({ error: `${config.notFoundLabel} not found` }, { status: 404 })

  const ownerId = typeof resource[config.ownerColumn] === 'string' ? resource[config.ownerColumn] : null
  const isOwner = ownerId === userId
  let hasCollaboratorAccess = false

  if (!isOwner) {
    const { data: accessRow, error: accessError } = await supabase
      .from(config.collaboratorTable)
      .select(config.collaboratorResourceColumn)
      .eq(config.collaboratorResourceColumn, resourceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (accessError) return createErrorResponse(accessError, 'Load collaborators error')
    hasCollaboratorAccess = !!accessRow
  }

  if (!isOwner && !hasCollaboratorAccess) {
    return NextResponse.json({ error: config.accessDeniedMessage }, { status: 403 })
  }

  const { data: collaboratorRows, error: collaboratorError } = await supabase
    .from(config.collaboratorTable)
    .select(`${config.collaboratorResourceColumn}, user_id, role, created_at`)
    .eq(config.collaboratorResourceColumn, resourceId)
    .order('created_at', { ascending: true })

  if (collaboratorError) return createErrorResponse(collaboratorError, 'Load collaborators error')

  const typedCollaboratorRows = ((collaboratorRows || []) as CollaboratorRow[])
    .filter((row) => typeof row.user_id === 'string' && !!row.user_id)
  const collaboratorUserIds = typedCollaboratorRows.map((row) => row.user_id)
  const profileIds = ownerId ? Array.from(new Set([ownerId, ...collaboratorUserIds])) : Array.from(new Set(collaboratorUserIds))

  let profilesById = new Map<string, ProfileRow>()
  if (profileIds.length > 0) {
    const { data: profileRows } = await readClient.from('profiles').select(config.profileSelect).in('id', profileIds)
    profilesById = mapProfilesById((profileRows || []) as ProfileRow[])
  }

  const collaborators = mapCollaborators(typedCollaboratorRows, profilesById, resolveDisplayName)
  const ownerProfile = ownerId ? profilesById.get(ownerId) || null : null
  let activeInvites: InviteItem[] = []

  if (isOwner) {
    const { invites, error: inviteError } = await loadActiveInvites({ supabase, resourceId, config })
    if (inviteError) return createErrorResponse(inviteError, 'Load collaborators error')
    activeInvites = invites
  }

  return NextResponse.json({
    owner: ownerId
      ? {
          userId: ownerId,
          profile: {
            displayName: resolveDisplayName(ownerProfile, ownerId),
            username: ownerProfile?.username || null,
            avatarUrl: ownerProfile?.avatar_url || null,
          },
        }
      : null,
    collaborators,
    isOwner,
    draftStatus: 'status' in resource ? resource.status : undefined,
    activeInvites,
  })
}

export async function createCollaboratorInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  userId: string
  requestBody: unknown
  origin: string
  config: BaseCollaboratorConfig
  requireDraftStatus?: boolean
}) {
  const { supabase, resourceId, userId, requestBody, origin, config, requireDraftStatus = false } = input
  const { data: resource, error: resourceError } = await loadResourceOwner({
    supabase,
    resourceId,
    config,
    includeStatus: requireDraftStatus,
  })

  if (resourceError) return createErrorResponse(resourceError, config.createInviteErrorMessage)
  if (!resource) return NextResponse.json({ error: `${config.notFoundLabel} not found` }, { status: 404 })

  const ownerId = typeof resource[config.ownerColumn] === 'string' ? resource[config.ownerColumn] : null
  if (!ownerId || ownerId !== userId) {
    return NextResponse.json({ error: config.createInviteForbiddenMessage }, { status: 403 })
  }

  if (requireDraftStatus && resource.status !== 'draft') {
    return NextResponse.json({ error: config.shareForbiddenMessage || 'Only draft submissions can be shared' }, { status: 400 })
  }

  const { maxUses, expiresAt } = parseInviteOptions(requestBody)
  if (expiresAt) {
    const parsed = new Date(expiresAt)
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid expiresAt value' }, { status: 400 })
    }
  }

  const insertValues: Record<string, string | number | null> = {
    created_by: userId,
    max_uses: maxUses,
    expires_at: expiresAt,
  }
  insertValues[config.inviteResourceColumn] = resourceId

  const { data: invite, error: inviteError } = await supabase
    .from(config.inviteTable)
    .insert(insertValues)
    .select('id, token, max_uses, used_count, expires_at, created_at')
    .single()

  if (inviteError || !invite) return createErrorResponse(inviteError, config.createInviteErrorMessage)

  return NextResponse.json({
    success: true,
    invite: {
      id: invite.id,
      token: invite.token,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
      inviteUrl: config.createInvitePath(invite.token, origin),
    },
  })
}

export async function revokeCollaboratorInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  userId: string
  requestBody: unknown
  config: BaseCollaboratorConfig
}) {
  const { supabase, resourceId, userId, requestBody, config } = input
  const body = requestBody as { inviteId?: unknown } | null
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : ''
  if (!inviteId) return NextResponse.json({ error: 'Invite ID is required' }, { status: 400 })

  const { data: resource, error: resourceError } = await loadResourceOwner({
    supabase,
    resourceId,
    config,
  })

  if (resourceError) return createErrorResponse(resourceError, config.revokeInviteErrorMessage)
  if (!resource) return NextResponse.json({ error: `${config.notFoundLabel} not found` }, { status: 404 })

  const ownerId = typeof resource[config.ownerColumn] === 'string' ? resource[config.ownerColumn] : null
  if (!ownerId || ownerId !== userId) {
    return NextResponse.json({ error: config.revokeInviteForbiddenMessage }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from(config.inviteTable)
    .delete()
    .eq('id', inviteId)
    .eq(config.inviteResourceColumn, resourceId)

  if (deleteError) return createErrorResponse(deleteError, config.revokeInviteErrorMessage)
  return NextResponse.json({ success: true })
}

export async function claimCollaboratorInvite(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  token: string
  config: ClaimInviteConfig
}) {
  const { supabase, token, config } = input
  const tokenValue = typeof token === 'string' ? token.trim() : ''

  if (!tokenValue) {
    return NextResponse.json({ error: 'Invite token is required' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc(config.claimInviteRpc, {
    p_token: tokenValue,
  })

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired collaborator invite' }, { status: 400 })
  }

  const claim = data as SharedClaimResult
  const resourceId = claim.image_id || claim.draft_id
  if (!resourceId) {
    return NextResponse.json({ error: 'Invalid collaborator invite' }, { status: 400 })
  }

  return NextResponse.json({ success: true, redirectTo: config.successRedirectPath(resourceId) })
}

export async function removeCollaborator(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  resourceId: string
  collaboratorUserId: string
  requesterId: string
  config: BaseCollaboratorConfig
  requireDraftStatus?: boolean
}) {
  const { supabase, resourceId, collaboratorUserId, requesterId, config, requireDraftStatus = false } = input
  const selectFields = requireDraftStatus
    ? `id, ${config.ownerColumn}, status`
    : `id, ${config.ownerColumn}`

  const { data: resource, error: resourceError } = await supabase
    .from(config.resourceTable)
    .select(selectFields)
    .eq(config.resourceIdColumn, resourceId)
    .maybeSingle()

  if (resourceError) return createErrorResponse(resourceError, config.removeErrorMessage)
  if (!resource) return NextResponse.json({ error: `${config.notFoundLabel} not found` }, { status: 404 })
  if (requireDraftStatus && resource.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft submissions can be updated' }, { status: 400 })
  }

  const ownerId = typeof resource[config.ownerColumn] === 'string' ? resource[config.ownerColumn] : null
  const isOwner = ownerId === requesterId
  const isSelfLeave = requesterId === collaboratorUserId

  if (ownerId && collaboratorUserId === ownerId) {
    return NextResponse.json({ error: config.resourceTable === 'submission_drafts' ? 'Owner cannot be removed from draft' : 'Cannot remove the owner' }, { status: 400 })
  }

  if (!isOwner && !isSelfLeave) {
    return NextResponse.json({ error: config.nonOwnerRemovalErrorMessage || 'Only the owner can remove collaborators' }, { status: 403 })
  }

  const { data: existingCollaborator, error: existingCollaboratorError } = await supabase
    .from(config.collaboratorTable)
    .select(config.collaboratorResourceColumn)
    .eq(config.collaboratorResourceColumn, resourceId)
    .eq('user_id', collaboratorUserId)
    .maybeSingle()

  if (existingCollaboratorError) return createErrorResponse(existingCollaboratorError, config.removeErrorMessage)
  if (!existingCollaborator) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })

  const { error: deleteError } = await supabase
    .from(config.collaboratorTable)
    .delete()
    .eq(config.collaboratorResourceColumn, resourceId)
    .eq('user_id', collaboratorUserId)

  if (deleteError) return createErrorResponse(deleteError, config.removeErrorMessage)
  return NextResponse.json({ success: true, left: isSelfLeave && !isOwner })
}
