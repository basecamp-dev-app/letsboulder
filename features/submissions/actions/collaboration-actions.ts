'use server'

import { headers } from 'next/headers'
import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { getAdminClient, getServerClient } from '@/lib/supabase-server'
import { createDraftInvite, listDraftCollaborators, removeDraftCollaborator, revokeDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'

interface OwnerProfile {
  displayName: string
  username: string | null
  avatarUrl?: string | null
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface CollaboratorRow {
  image_id: string
  user_id: string
  role: string
  created_at: string
}

function getDisplayName(profile: ProfileRow | null): string {
  if (!profile) return 'Unknown user'
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return 'Unknown user'
}

async function getOriginFromHeaders(): Promise<string> {
  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin') || requestHeaders.get('x-forwarded-proto') && requestHeaders.get('host')
  if (origin && origin.startsWith('http')) return origin

  const proto = requestHeaders.get('x-forwarded-proto') || 'https'
  const host = requestHeaders.get('host') || 'localhost'
  return `${proto}://${host}`
}

async function resolveSubmissionOwner(supabase: Awaited<ReturnType<typeof getServerClient>>, imageId: string) {
  const { data, error } = await supabase.from('images').select('id, created_by').eq('id', imageId).maybeSingle()
  if (error) return { ownerId: null, exists: false, error }
  if (!data) return { ownerId: null, exists: false, error: null }
  return { ownerId: typeof data.created_by === 'string' ? data.created_by : null, exists: true, error: null }
}

async function userCanAccessSubmissionCollaborators(supabase: Awaited<ReturnType<typeof getServerClient>>, imageId: string, userId: string, ownerId: string | null) {
  if (ownerId && ownerId === userId) return true
  const { data, error } = await supabase.from('submission_collaborators').select('image_id').eq('image_id', imageId).eq('user_id', userId).maybeSingle()
  if (error) return false
  return !!data
}

export async function fetchSubmissionCollaboratorsAction(activeImageId: string): Promise<ActionResult<{ ownerUserId: string | null; ownerProfile: OwnerProfile | null; collaborators: CollaboratorItem[]; isOwner: boolean; activeInvites: InviteItem[] }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const { ownerId, exists, error: ownerError } = await resolveSubmissionOwner(supabase, activeImageId)
  if (ownerError) return { success: false, error: 'Load collaborators error', status: 500 }
  if (!exists) return { success: false, error: 'Image not found', status: 404 }

  const canAccess = await userCanAccessSubmissionCollaborators(supabase, activeImageId, auth.data.userId, ownerId)
  if (!canAccess) return { success: false, error: 'You do not have access to this submission', status: 403 }

  const { data: collaboratorRows, error: collaboratorError } = await supabase
    .from('submission_collaborators')
    .select('image_id, user_id, role, created_at')
    .eq('image_id', activeImageId)
    .order('created_at', { ascending: true })

  if (collaboratorError) return { success: false, error: 'Load collaborators error', status: 500 }

  const collaboratorUserIds = ((collaboratorRows || []) as CollaboratorRow[])
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === 'string' && !!id)

  const profileIds = ownerId ? Array.from(new Set([ownerId, ...collaboratorUserIds])) : Array.from(new Set(collaboratorUserIds))
  let profilesById = new Map<string, ProfileRow>()

  if (profileIds.length > 0) {
    const { data: profileRows } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', profileIds)
    profilesById = new Map(((profileRows || []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  }

  const ownerProfile = ownerId ? profilesById.get(ownerId) || null : null
  const collaborators = ((collaboratorRows || []) as CollaboratorRow[]).map((row) => {
    const profile = profilesById.get(row.user_id) || null
    return {
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      profile: {
        displayName: getDisplayName(profile),
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      },
    }
  })

  const isOwner = ownerId === auth.data.userId
  let activeInvites: InviteItem[] = []

  if (isOwner) {
    const { data: inviteRows, error: inviteError } = await supabase
      .from('submission_collaborator_invites')
      .select('id, token, max_uses, used_count, expires_at, created_at')
      .eq('image_id', activeImageId)
      .order('created_at', { ascending: false })

    if (inviteError) return { success: false, error: 'Load collaborators error', status: 500 }

    const nowIso = new Date().toISOString()
    activeInvites = ((inviteRows || []) as Array<{ id: string; token: string; max_uses: number | null; used_count: number; expires_at: string | null; created_at: string }>)
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
  }

  return {
    success: true,
    data: {
      ownerUserId: ownerId,
      ownerProfile: ownerId ? { displayName: getDisplayName(ownerProfile), username: ownerProfile?.username || null, avatarUrl: ownerProfile?.avatar_url || null } : null,
      collaborators,
      isOwner,
      activeInvites,
    },
  }
}

export async function createSubmissionInviteAction(activeImageId: string): Promise<ActionResult<{ inviteUrl: string | null }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const { ownerId, exists, error: ownerError } = await resolveSubmissionOwner(supabase, activeImageId)
  if (ownerError) return { success: false, error: 'Create collaborator invite error', status: 500 }
  if (!exists) return { success: false, error: 'Image not found', status: 404 }
  if (!ownerId || ownerId !== auth.data.userId) return { success: false, error: 'Only the submission owner can create invites', status: 403 }

  const { data: invite, error: inviteError } = await supabase
    .from('submission_collaborator_invites')
    .insert({ image_id: activeImageId, created_by: auth.data.userId, max_uses: null, expires_at: null })
    .select('id, token')
    .single()

  if (inviteError || !invite) return { success: false, error: 'Create collaborator invite error', status: 500 }
  const origin = await getOriginFromHeaders()
  return { success: true, data: { inviteUrl: `${origin}/api/submissions/collaborate/${invite.token}` } }
}

export async function revokeSubmissionInviteAction(activeImageId: string, inviteId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }
  if (!inviteId) return { success: false, error: 'Invite ID is required', status: 400 }

  const supabase = await getServerClient()
  const { ownerId, exists, error: ownerError } = await resolveSubmissionOwner(supabase, activeImageId)
  if (ownerError) return { success: false, error: 'Revoke collaborator invite error', status: 500 }
  if (!exists) return { success: false, error: 'Image not found', status: 404 }
  if (!ownerId || ownerId !== auth.data.userId) return { success: false, error: 'Only the submission owner can revoke invites', status: 403 }

  const { error } = await supabase.from('submission_collaborator_invites').delete().eq('id', inviteId).eq('image_id', activeImageId)
  if (error) return { success: false, error: 'Revoke collaborator invite error', status: 500 }
  return { success: true }
}

export async function removeSubmissionCollaboratorAction(activeImageId: string, collaboratorUserId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId || !collaboratorUserId) return { success: false, error: 'Image ID and user ID are required', status: 400 }

  const supabase = await getServerClient()
  const { data: image, error: imageError } = await supabase.from('images').select('id, created_by').eq('id', activeImageId).maybeSingle()
  if (imageError) return { success: false, error: 'Remove collaborator error', status: 500 }
  if (!image) return { success: false, error: 'Image not found', status: 404 }
  if (!image.created_by || image.created_by !== auth.data.userId) return { success: false, error: 'Only the submission owner can remove collaborators', status: 403 }
  if (collaboratorUserId === image.created_by) return { success: false, error: 'Cannot remove the owner', status: 400 }

  const { error } = await supabase.from('submission_collaborators').delete().eq('image_id', activeImageId).eq('user_id', collaboratorUserId)
  if (error) return { success: false, error: 'Remove collaborator error', status: 500 }
  return { success: true }
}

export async function fetchDraftCollaboratorsAction(draftId: string): Promise<ActionResult<{ collaborators: CollaboratorItem[]; activeInvites: InviteItem[] }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const supabase = await getServerClient()
  const readClient = getAdminClient()
  const response = await listDraftCollaborators({ supabase, readClient, draftId, userId: auth.data.userId })
  const payload = await response.json().catch(() => ({} as { error?: string; collaborators?: CollaboratorItem[]; invites?: InviteItem[] }))
  if (!response.ok) return { success: false, error: payload.error || 'Load draft collaborators error', status: response.status }
  return { success: true, data: { collaborators: payload.collaborators || [], activeInvites: payload.invites || [] } }
}

export async function createDraftInviteAction(draftId: string): Promise<ActionResult<{ inviteUrl: string | null }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const supabase = await getServerClient()
  const origin = await getOriginFromHeaders()
  const response = await createDraftInvite({ supabase, draftId, userId: auth.data.userId, requestBody: {}, origin })
  const payload = await response.json().catch(() => ({} as { error?: string; invite?: { inviteUrl?: string } }))
  if (!response.ok) return { success: false, error: payload.error || 'Create draft invite error', status: response.status }
  return { success: true, data: { inviteUrl: payload.invite?.inviteUrl || null } }
}

export async function revokeDraftInviteAction(draftId: string, inviteId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const supabase = await getServerClient()
  const response = await revokeDraftInvite({ supabase, draftId, userId: auth.data.userId, requestBody: { inviteId } })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Revoke draft invite error', status: response.status }
  return { success: true }
}

export async function removeDraftCollaboratorAction(draftId: string, collaboratorUserId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId || !collaboratorUserId) return { success: false, error: 'Draft ID and user ID are required', status: 400 }

  const supabase = await getServerClient()
  const response = await removeDraftCollaborator({ supabase, draftId, collaboratorUserId, requesterId: auth.data.userId })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Remove draft collaborator error', status: response.status }
  return { success: true }
}
