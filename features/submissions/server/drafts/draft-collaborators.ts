import { resolveDraftPersonLabel, type ProfileRow } from '@/features/submissions/server/drafts/draft-route-shared'
import { claimCollaboratorInvite, createCollaboratorInvite, listCollaborators, removeCollaborator, revokeCollaboratorInvite } from '@/features/submissions/server/collaboration/shared-collaborators'

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
  readClient: ReturnType<typeof import('@supabase/ssr').createServerClient>
  draftId: string
  userId: string
}) {
  const { supabase, readClient, draftId, userId } = input
  return listCollaborators({
    supabase,
    readClient,
    resourceId: draftId,
    userId,
    config: draftCollaboratorConfig,
    resolveDisplayName: (profile: ProfileRow | null, collaboratorUserId: string) => resolveDraftPersonLabel(profile, collaboratorUserId),
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
