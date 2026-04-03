'use server'

import { headers } from 'next/headers'
import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { getAdminClient, getServerClient } from '@/lib/supabase-server'
import { createCollaboratorInvite, listCollaborators, removeCollaborator, revokeCollaboratorInvite } from '@/features/submissions/server/collaboration/shared-collaborators'
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
  avatar_url?: string | null
}

const submissionCollaboratorConfig = {
  resourceTable: 'images' as const,
  resourceIdColumn: 'id' as const,
  ownerColumn: 'created_by' as const,
  collaboratorTable: 'submission_collaborators' as const,
  collaboratorResourceColumn: 'image_id' as const,
  inviteTable: 'submission_collaborator_invites' as const,
  inviteResourceColumn: 'image_id' as const,
  claimInviteRpc: 'claim_submission_collaborator_invite' as const,
  invalidInviteErrorPath: '/logbook?error=invalid-collab-invite',
  authRedirectPath: (token: string) => `/api/submissions/collaborate/${encodeURIComponent(token)}`,
  successRedirectPath: (resourceId: string) => `/logbook/submissions/${resourceId}/edit?collab=added`,
  notFoundLabel: 'Image',
  removeErrorMessage: 'Remove collaborator error',
  nonOwnerRemovalErrorMessage: 'Only the submission owner can remove collaborators',
  accessDeniedMessage: 'You do not have access to this submission',
  createInviteErrorMessage: 'Create collaborator invite error',
  revokeInviteErrorMessage: 'Revoke collaborator invite error',
  createInviteForbiddenMessage: 'Only the submission owner can create invites',
  revokeInviteForbiddenMessage: 'Only the submission owner can revoke invites',
  profileSelect: 'id, username, display_name, avatar_url',
  createInvitePath: (token: string, origin: string) => `${origin}/api/submissions/collaborate/${token}`,
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

export async function fetchSubmissionCollaboratorsAction(activeImageId: string): Promise<ActionResult<{ ownerUserId: string | null; ownerProfile: OwnerProfile | null; collaborators: CollaboratorItem[]; isOwner: boolean; activeInvites: InviteItem[] }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const response = await listCollaborators({
    supabase,
    readClient: supabase,
    resourceId: activeImageId,
    userId: auth.data.userId,
    config: submissionCollaboratorConfig,
    resolveDisplayName: (profile) => getDisplayName(profile),
  })
  const payload = await response.json().catch(() => ({} as {
    error?: string
    owner?: { userId?: string | null; profile?: OwnerProfile | null } | null
    collaborators?: CollaboratorItem[]
    isOwner?: boolean
    activeInvites?: InviteItem[]
  }))
  if (!response.ok) return { success: false, error: payload.error || 'Load collaborators error', status: response.status }
  return {
    success: true,
    data: {
      ownerUserId: payload.owner?.userId || null,
      ownerProfile: payload.owner?.profile || null,
      collaborators: payload.collaborators || [],
      isOwner: payload.isOwner === true,
      activeInvites: payload.activeInvites || [],
    },
  }
}

export async function createSubmissionInviteAction(activeImageId: string): Promise<ActionResult<{ inviteUrl: string | null }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const origin = await getOriginFromHeaders()
  const response = await createCollaboratorInvite({
    supabase,
    resourceId: activeImageId,
    userId: auth.data.userId,
    requestBody: {},
    origin,
    config: submissionCollaboratorConfig,
  })
  const payload = await response.json().catch(() => ({} as { error?: string; invite?: { inviteUrl?: string } }))
  if (!response.ok) return { success: false, error: payload.error || 'Create collaborator invite error', status: response.status }
  return { success: true, data: { inviteUrl: payload.invite?.inviteUrl || null } }
}

export async function revokeSubmissionInviteAction(activeImageId: string, inviteId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId) return { success: false, error: 'Image ID is required', status: 400 }
  if (!inviteId) return { success: false, error: 'Invite ID is required', status: 400 }

  const supabase = await getServerClient()
  const response = await revokeCollaboratorInvite({
    supabase,
    resourceId: activeImageId,
    userId: auth.data.userId,
    requestBody: { inviteId },
    config: submissionCollaboratorConfig,
  })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Revoke collaborator invite error', status: response.status }
  return { success: true }
}

export async function removeSubmissionCollaboratorAction(activeImageId: string, collaboratorUserId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!activeImageId || !collaboratorUserId) return { success: false, error: 'Image ID and user ID are required', status: 400 }

  const supabase = await getServerClient()
  const response = await removeCollaborator({
    supabase,
    resourceId: activeImageId,
    collaboratorUserId,
    requesterId: auth.data.userId,
    config: submissionCollaboratorConfig,
  })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Remove collaborator error', status: response.status }
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
  const payload = await response.json().catch(() => ({} as { error?: string; collaborators?: CollaboratorItem[]; activeInvites?: InviteItem[] }))
  if (!response.ok) return { success: false, error: payload.error || 'Load draft collaborators error', status: response.status }
  return { success: true, data: { collaborators: payload.collaborators || [], activeInvites: payload.activeInvites || [] } }
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
