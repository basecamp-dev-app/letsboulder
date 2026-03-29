'use client'

import { csrfFetch } from '@/hooks/useCsrf'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'

interface OwnerProfile {
  displayName: string
  username: string | null
}

interface SubmissionCollaboratorsResponse {
  owner: { userId: string; profile: OwnerProfile } | null
  collaborators: CollaboratorItem[]
  isOwner: boolean
  activeInvites?: InviteItem[]
  error?: string
}

interface DraftCollaboratorsResponse {
  collaborators?: CollaboratorItem[]
  invites?: InviteItem[]
  error?: string
}

interface CreateInviteResponse {
  invite?: { inviteUrl?: string }
  error?: string
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T))
}

export async function fetchSubmissionCollaborators(activeImageId: string) {
  const response = await fetch(`/api/submissions/${activeImageId}/collaborators`, { cache: 'no-store' })
  const data = await readJson<SubmissionCollaboratorsResponse>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load collaborators')
  }

  return {
    ownerUserId: data.owner?.userId || null,
    ownerProfile: data.owner?.profile || null,
    collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
    isOwner: Boolean(data.isOwner),
    activeInvites: Array.isArray(data.activeInvites) ? data.activeInvites : [],
  }
}

export async function fetchDraftCollaborators(draftId: string) {
  const response = await fetch(`/api/submissions/drafts/${draftId}/collaborators`, { cache: 'no-store' })
  const data = await readJson<DraftCollaboratorsResponse>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load draft collaborators')
  }

  return {
    collaborators: Array.isArray(data.collaborators) ? data.collaborators : [],
    activeInvites: Array.isArray(data.invites) ? data.invites : [],
  }
}

export async function createSubmissionInvite(activeImageId: string) {
  const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxUses: null, expiresAt: null }),
  })
  const data = await readJson<CreateInviteResponse>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create invite link')
  }

  return data.invite?.inviteUrl || null
}

export async function createDraftInvite(draftId: string) {
  const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, { method: 'POST' })
  const data = await readJson<CreateInviteResponse>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create draft invite link')
  }

  return data.invite?.inviteUrl || null
}

export async function revokeSubmissionInvite(activeImageId: string, inviteId: string) {
  const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteId }),
  })
  const data = await readJson<{ error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to revoke invite')
  }
}

export async function revokeDraftInvite(draftId: string, inviteId: string) {
  const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteId }),
  })
  const data = await readJson<{ error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to revoke invite')
  }
}

export async function removeSubmissionCollaborator(activeImageId: string, collaboratorUserId: string) {
  const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators/${collaboratorUserId}`, { method: 'DELETE' })
  const data = await readJson<{ error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to remove collaborator')
  }
}

export async function removeDraftCollaborator(draftId: string, collaboratorUserId: string) {
  const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators/${collaboratorUserId}`, { method: 'DELETE' })
  const data = await readJson<{ error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to remove collaborator')
  }
}
