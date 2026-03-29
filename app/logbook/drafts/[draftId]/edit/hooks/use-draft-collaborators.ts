'use client'

import { useCallback, useState } from 'react'
import {
  createDraftInvite,
  fetchDraftCollaborators,
  removeDraftCollaborator,
  revokeDraftInvite,
} from '@/features/editor/collaboration/collaboration-api'
import { useInviteLinkCopy } from '@/features/editor/collaboration/use-invite-link-copy'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'

export function useDraftCollaborators(draftId: string | null, isOwner: boolean, addToast: (message: string, tone: 'success' | 'error') => void, setError: (message: string) => void) {
  const [shareOpen, setShareOpen] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([])
  const [activeInvites, setActiveInvites] = useState<InviteItem[]>([])
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null)
  const handleCopyInvite = useInviteLinkCopy(addToast, setError)

  const loadCollaborators = useCallback(async () => {
    if (!draftId) return
    setLoadingCollaborators(true)
    try {
      const data = await fetchDraftCollaborators(draftId)
      setCollaborators(data.collaborators)
      setActiveInvites(data.activeInvites)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load draft collaborators')
    } finally {
      setLoadingCollaborators(false)
    }
  }, [draftId, setError])

  const handleCreateInvite = useCallback(async () => {
    if (!draftId || !isOwner) return
    setCreatingInvite(true)
    try {
      const inviteUrl = await createDraftInvite(draftId)
      setLatestInviteUrl(inviteUrl)
      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteUrl)
      addToast('Invite link created', 'success')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create draft invite link')
      addToast('Failed to create invite link', 'error')
    } finally {
      setCreatingInvite(false)
    }
  }, [addToast, draftId, isOwner, setError])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!draftId || !isOwner) return
    setRevokingInviteId(inviteId)
    try {
      await revokeDraftInvite(draftId, inviteId)
      setActiveInvites((current) => current.filter((invite) => invite.id !== inviteId))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }, [draftId, isOwner, setError])

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: string) => {
    if (!draftId) return
    setRemovingCollaboratorId(collaboratorUserId)
    try {
      await removeDraftCollaborator(draftId, collaboratorUserId)
      setCollaborators((current) => current.filter((collaborator) => collaborator.userId !== collaboratorUserId))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [draftId, setError])

  return {
    shareOpen,
    setShareOpen,
    loadingCollaborators,
    collaborators,
    activeInvites,
    creatingInvite,
    revokingInviteId,
    removingCollaboratorId,
    latestInviteUrl,
    setLatestInviteUrl,
    loadCollaborators,
    handleCreateInvite,
    handleCopyInvite,
    handleRevokeInvite,
    handleRemoveCollaborator,
  }
}
