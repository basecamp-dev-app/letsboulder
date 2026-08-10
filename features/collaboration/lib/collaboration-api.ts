'use client'

import {
  createDraftInviteAction,
  createSubmissionInviteAction,
  fetchDraftCollaboratorsAction,
  fetchSubmissionCollaboratorsAction,
  removeDraftCollaboratorAction,
  removeSubmissionCollaboratorAction,
  revokeDraftInviteAction,
  revokeSubmissionInviteAction,
} from '@/features/submissions/public'

export async function fetchSubmissionCollaborators(activeImageId: string) {
  const result = await fetchSubmissionCollaboratorsAction(activeImageId)
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to load collaborators')
  }

  return {
    ownerUserId: result.data.ownerUserId,
    ownerProfile: result.data.ownerProfile,
    collaborators: result.data.collaborators,
    isOwner: Boolean(result.data.isOwner),
    activeInvites: result.data.activeInvites,
  }
}

export async function fetchDraftCollaborators(draftId: string) {
  const result = await fetchDraftCollaboratorsAction(draftId)
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to load draft collaborators')
  }

  return {
    collaborators: result.data.collaborators,
    activeInvites: result.data.activeInvites,
  }
}

export async function createSubmissionInvite(activeImageId: string) {
  const result = await createSubmissionInviteAction(activeImageId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to create invite link')
  }

  return result.data?.inviteUrl || null
}

export async function createDraftInvite(draftId: string) {
  const result = await createDraftInviteAction(draftId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to create draft invite link')
  }

  return result.data?.inviteUrl || null
}

export async function revokeSubmissionInvite(activeImageId: string, inviteId: string) {
  const result = await revokeSubmissionInviteAction(activeImageId, inviteId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to revoke invite')
  }
}

export async function revokeDraftInvite(draftId: string, inviteId: string) {
  const result = await revokeDraftInviteAction(draftId, inviteId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to revoke invite')
  }
}

export async function removeSubmissionCollaborator(activeImageId: string, collaboratorUserId: string) {
  const result = await removeSubmissionCollaboratorAction(activeImageId, collaboratorUserId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to remove collaborator')
  }
}

export async function removeDraftCollaborator(draftId: string, collaboratorUserId: string) {
  const result = await removeDraftCollaboratorAction(draftId, collaboratorUserId)
  if (!result.success) {
    throw new Error(result.error || 'Failed to remove collaborator')
  }
}
