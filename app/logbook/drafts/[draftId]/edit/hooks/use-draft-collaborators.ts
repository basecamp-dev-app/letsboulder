'use client'

import { useCallback, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import type { CollaboratorItem, InviteItem } from '@/lib/editor-types'

export function useDraftCollaborators(draftId: string | null, isOwner: boolean, addToast: (message: string, tone: 'success' | 'error') => void, setError: (message: string) => void) {
  const [shareOpen, setShareOpen] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([])
  const [activeInvites, setActiveInvites] = useState<InviteItem[]>([])
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null)

  const loadCollaborators = useCallback(async () => {
    if (!draftId) return
    setLoadingCollaborators(true)
    try {
      const response = await fetch(`/api/submissions/drafts/${draftId}/collaborators`, { cache: 'no-store' })
      const data = await response.json() as { collaborators?: CollaboratorItem[]; invites?: InviteItem[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Failed to load draft collaborators')
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : [])
      setActiveInvites(Array.isArray(data.invites) ? data.invites : [])
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
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, { method: 'POST' })
      const data = await response.json() as { invite?: { inviteUrl?: string }; error?: string }
      if (!response.ok) throw new Error(data.error || 'Failed to create draft invite link')
      const inviteUrl = data.invite?.inviteUrl || null
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

  const handleCopyInvite = useCallback(async (inviteUrl: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      addToast('Invite link copied', 'success')
    } catch {
      setError('Failed to copy invite link')
      addToast('Failed to copy invite link', 'error')
    }
  }, [addToast, setError])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!draftId || !isOwner) return
    setRevokingInviteId(inviteId)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, { method: 'DELETE', body: JSON.stringify({ inviteId }) })
      if (!response.ok) throw new Error('Failed to revoke invite')
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
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators/${collaboratorUserId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to remove collaborator')
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
