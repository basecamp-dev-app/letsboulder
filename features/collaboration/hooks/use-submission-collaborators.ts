'use client'

import { useCallback, useState } from 'react'
import {
  createSubmissionInvite,
  fetchSubmissionCollaborators,
  removeSubmissionCollaborator,
  revokeSubmissionInvite,
} from '../lib/collaboration-api'
import { useInviteLinkCopy } from './use-invite-link-copy'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'

export function useSubmissionCollaborators(activeImageId: string | null, addToast: (message: string, tone: 'success' | 'error') => void, setError: (message: string | null) => void) {
  const [shareOpen, setShareOpen] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([])
  const [activeInvites, setActiveInvites] = useState<InviteItem[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [ownerProfile, setOwnerProfile] = useState<{ displayName: string; username: string | null } | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null)
  const handleCopyInvite = useInviteLinkCopy(addToast, (message) => setError(message))

  const loadCollaborators = useCallback(async () => {
    if (!activeImageId) return
    setLoadingCollaborators(true)
    try {
      const data = await fetchSubmissionCollaborators(activeImageId)
      setOwnerUserId(data.ownerUserId)
      setOwnerProfile(data.ownerProfile)
      setCollaborators(data.collaborators)
      setIsOwner(data.isOwner)
      setActiveInvites(data.activeInvites)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collaborators')
    } finally {
      setLoadingCollaborators(false)
    }
  }, [activeImageId, setError])

  const handleCreateInvite = useCallback(async () => {
    if (!activeImageId || creatingInvite || !isOwner) return
    setCreatingInvite(true)
    setError(null)
    try {
      const inviteUrl = await createSubmissionInvite(activeImageId)
      setLatestInviteUrl(inviteUrl)
      if (inviteUrl) addToast('Invite link created and copied', 'success')
      else addToast('Invite link created', 'success')
      await loadCollaborators()
      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite link')
    } finally {
      setCreatingInvite(false)
    }
  }, [activeImageId, addToast, creatingInvite, isOwner, loadCollaborators, setError])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!activeImageId || !isOwner || revokingInviteId) return
    setRevokingInviteId(inviteId)
    setError(null)
    try {
      await revokeSubmissionInvite(activeImageId, inviteId)
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }, [activeImageId, isOwner, loadCollaborators, revokingInviteId, setError])

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: string) => {
    if (!activeImageId || !isOwner || removingCollaboratorId) return
    setRemovingCollaboratorId(collaboratorUserId)
    setError(null)
    try {
      await removeSubmissionCollaborator(activeImageId, collaboratorUserId)
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [activeImageId, isOwner, loadCollaborators, removingCollaboratorId, setError])

  return { shareOpen, setShareOpen, loadingCollaborators, collaborators, activeInvites, isOwner, ownerUserId, ownerProfile, creatingInvite, revokingInviteId, removingCollaboratorId, latestInviteUrl, loadCollaborators, handleCreateInvite, handleCopyInvite, handleRevokeInvite, handleRemoveCollaborator }
}
