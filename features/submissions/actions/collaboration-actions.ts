'use server'

import { headers } from 'next/headers'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getAdminClient, getServerClient } from '@/lib/supabase-server'
import { createCollaboratorInvite, listCollaborators, removeCollaborator, revokeCollaboratorInvite } from '@/features/submissions/server/collaboration/shared-collaborators'
import { createDraftInvite, listDraftCollaborators, removeDraftCollaborator, revokeDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'
import { z } from 'zod'

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

const imageIdSchema = z.object({
  activeImageId: z.string().trim().min(1, 'Image ID is required'),
})

const draftIdSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID is required'),
})

const inviteSchema = z.object({
  activeImageId: z.string().trim().min(1, 'Image ID is required'),
  inviteId: z.string().trim().min(1, 'Invite ID is required'),
})

const submissionCollaboratorSchema = z.object({
  activeImageId: z.string().trim().min(1, 'Image ID and user ID are required'),
  collaboratorUserId: z.string().trim().min(1, 'Image ID and user ID are required'),
})

const draftInviteSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID is required'),
  inviteId: z.string().trim().min(1, 'Invite ID is required'),
})

const draftCollaboratorSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID and user ID are required'),
  collaboratorUserId: z.string().trim().min(1, 'Draft ID and user ID are required'),
})

export async function fetchSubmissionCollaboratorsAction(activeImageId: string): Promise<ActionResult<{ ownerUserId: string | null; ownerProfile: OwnerProfile | null; collaborators: CollaboratorItem[]; isOwner: boolean; activeInvites: InviteItem[] }>> {
  const validation = validateActionInput(imageIdSchema, { activeImageId })
  if (!validation.success) return fail(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const response = await listCollaborators({
    supabase,
    readClient: supabase,
    resourceId: validation.data.activeImageId,
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
  const validation = validateActionInput(imageIdSchema, { activeImageId })
  if (!validation.success) return fail<{ inviteUrl: string | null }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const origin = await getOriginFromHeaders()
  const response = await createCollaboratorInvite({
    supabase,
    resourceId: validation.data.activeImageId,
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
  const validation = validateActionInput(inviteSchema, { activeImageId, inviteId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const response = await revokeCollaboratorInvite({
    supabase,
    resourceId: validation.data.activeImageId,
    userId: auth.data.userId,
    requestBody: { inviteId: validation.data.inviteId },
    config: submissionCollaboratorConfig,
  })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Revoke collaborator invite error', status: response.status }
  return { success: true }
}

export async function removeSubmissionCollaboratorAction(activeImageId: string, collaboratorUserId: string): Promise<ActionResult> {
  const validation = validateActionInput(submissionCollaboratorSchema, { activeImageId, collaboratorUserId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const response = await removeCollaborator({
    supabase,
    resourceId: validation.data.activeImageId,
    collaboratorUserId: validation.data.collaboratorUserId,
    requesterId: auth.data.userId,
    config: submissionCollaboratorConfig,
  })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Remove collaborator error', status: response.status }
  return { success: true }
}

export async function fetchDraftCollaboratorsAction(draftId: string): Promise<ActionResult<{ collaborators: CollaboratorItem[]; activeInvites: InviteItem[] }>> {
  const validation = validateActionInput(draftIdSchema, { draftId })
  if (!validation.success) return fail<{ collaborators: CollaboratorItem[]; activeInvites: InviteItem[] }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const readClient = getAdminClient()
  const response = await listDraftCollaborators({ supabase, readClient, draftId: validation.data.draftId, userId: auth.data.userId })
  const payload = await response.json().catch(() => ({} as { error?: string; collaborators?: CollaboratorItem[]; activeInvites?: InviteItem[] }))
  if (!response.ok) return { success: false, error: payload.error || 'Load draft collaborators error', status: response.status }
  return { success: true, data: { collaborators: payload.collaborators || [], activeInvites: payload.activeInvites || [] } }
}

export async function createDraftInviteAction(draftId: string): Promise<ActionResult<{ inviteUrl: string | null }>> {
  const validation = validateActionInput(draftIdSchema, { draftId })
  if (!validation.success) return fail<{ inviteUrl: string | null }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const origin = await getOriginFromHeaders()
  const response = await createDraftInvite({ supabase, draftId: validation.data.draftId, userId: auth.data.userId, requestBody: {}, origin })
  const payload = await response.json().catch(() => ({} as { error?: string; invite?: { inviteUrl?: string } }))
  if (!response.ok) return { success: false, error: payload.error || 'Create draft invite error', status: response.status }
  return { success: true, data: { inviteUrl: payload.invite?.inviteUrl || null } }
}

export async function revokeDraftInviteAction(draftId: string, inviteId: string): Promise<ActionResult> {
  const validation = validateActionInput(draftInviteSchema, { draftId, inviteId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const response = await revokeDraftInvite({ supabase, draftId: validation.data.draftId, userId: auth.data.userId, requestBody: { inviteId: validation.data.inviteId } })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Revoke draft invite error', status: response.status }
  return { success: true }
}

export async function removeDraftCollaboratorAction(draftId: string, collaboratorUserId: string): Promise<ActionResult> {
  const validation = validateActionInput(draftCollaboratorSchema, { draftId, collaboratorUserId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const response = await removeDraftCollaborator({ supabase, draftId: validation.data.draftId, collaboratorUserId: validation.data.collaboratorUserId, requesterId: auth.data.userId })
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Remove draft collaborator error', status: response.status }
  return { success: true }
}
