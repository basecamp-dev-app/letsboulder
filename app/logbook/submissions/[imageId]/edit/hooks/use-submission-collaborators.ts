'use client'

import { useCallback, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import type { CollaboratorItem, InviteItem } from '@/lib/editor-types'

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

  const loadCollaborators = useCallback(async () => {
    if (!activeImageId) return
    setLoadingCollaborators(true)
    try {
      const response = await fetch(`/api/submissions/${activeImageId}/collaborators`, { cache: 'no-store' })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Failed to load collaborators') }
      const data = await response.json() as { owner: { userId: string; profile: { displayName: string; username: string | null } } | null; collaborators: CollaboratorItem[]; isOwner: boolean; activeInvites?: InviteItem[] }
      setOwnerUserId(data.owner?.userId || null)
      setOwnerProfile(data.owner?.profile || null)
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : [])
      setIsOwner(Boolean(data.isOwner))
      setActiveInvites(Array.isArray(data.activeInvites) ? data.activeInvites : [])
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
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxUses: null, expiresAt: null }) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Failed to create invite link') }
      const data = await response.json() as { invite?: { inviteUrl?: string } }
      const inviteUrl = data.invite?.inviteUrl || null
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

  const handleCopyInvite = useCallback(async (inviteUrl: string) => {
    try { await navigator.clipboard.writeText(inviteUrl); addToast('Invite link copied', 'success') } catch { setError('Failed to copy invite link'); addToast('Failed to copy invite link', 'error') }
  }, [addToast, setError])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!activeImageId || !isOwner || revokingInviteId) return
    setRevokingInviteId(inviteId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteId }) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Failed to revoke invite') }
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
      const response = await csrfFetch(`/api/submissions/${activeImageId}/collaborators/${collaboratorUserId}`, { method: 'DELETE' })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error || 'Failed to remove collaborator') }
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [activeImageId, isOwner, loadCollaborators, removingCollaboratorId, setError])

  return { shareOpen, setShareOpen, loadingCollaborators, collaborators, activeInvites, isOwner, ownerUserId, ownerProfile, creatingInvite, revokingInviteId, removingCollaboratorId, latestInviteUrl, loadCollaborators, handleCreateInvite, handleCopyInvite, handleRevokeInvite, handleRemoveCollaborator }
}
