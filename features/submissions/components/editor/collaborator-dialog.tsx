'use client'

import { Loader2, Link2, Trash2, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CollaboratorItem, InviteItem } from '@/features/submissions/lib/editor-types'

interface CollaboratorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  isOwner: boolean
  ownerUserId: string | null
  ownerProfile: { displayName: string; username: string | null } | null
  collaborators: CollaboratorItem[]
  activeInvites: InviteItem[]
  loadingCollaborators: boolean
  creatingInvite: boolean
  revokingInviteId: string | null
  removingCollaboratorId: string | null
  latestInviteUrl: string | null
  inviteUrlPrefix: string
  onCreateInvite: () => void
  onCopyInvite: (url: string) => void
  onRevokeInvite: (inviteId: string) => void
  onRemoveCollaborator: (userId: string) => void
  showLeaveButton?: boolean
  onLeave?: () => void
  currentUserId?: string | null
}

export function CollaboratorDialog({
  open,
  onOpenChange,
  title,
  description,
  isOwner,
  ownerUserId,
  ownerProfile,
  collaborators,
  activeInvites,
  loadingCollaborators,
  creatingInvite,
  revokingInviteId,
  removingCollaboratorId,
  latestInviteUrl,
  inviteUrlPrefix,
  onCreateInvite,
  onCopyInvite,
  onRevokeInvite,
  onRemoveCollaborator,
  showLeaveButton,
  onLeave,
  currentUserId,
}: CollaboratorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              <Link2 className="h-4 w-4" />
              Invite link
            </div>
            {isOwner ? (
              <button
                type="button"
                onClick={onCreateInvite}
                disabled={creatingInvite}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create new link
              </button>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Only the owner can create invite links.</p>
            )}

            {latestInviteUrl ? (
              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                <p className="break-all text-gray-700 dark:text-gray-200">{latestInviteUrl}</p>
                <button
                  type="button"
                  onClick={() => onCopyInvite(latestInviteUrl)}
                  className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Copy link
                </button>
              </div>
            ) : null}

            {activeInvites.length > 0 ? (
              <div className="mt-3 space-y-2">
                {activeInvites.map((invite) => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : ''
                  const inviteUrl = `${origin}${inviteUrlPrefix}/${invite.token}`
                  return (
                    <div key={invite.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-700">
                      <p className="break-all text-gray-600 dark:text-gray-300">{inviteUrl}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onCopyInvite(inviteUrl)}
                          className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Copy
                        </button>
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => onRevokeInvite(invite.id)}
                            disabled={revokingInviteId === invite.id}
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                            {revokingInviteId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              <Users className="h-4 w-4" />
              Collaborators
            </div>

            {loadingCollaborators ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading collaborators...
              </div>
            ) : (
              <div className="space-y-2">
                {ownerUserId && ownerProfile ? (
                  <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ownerProfile.displayName} (Owner)</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                    </div>
                  </div>
                ) : null}

                {collaborators.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No collaborators yet.</p>
                ) : (
                  collaborators.map((collaborator) => {
                    const isOwnerRow = ownerUserId === collaborator.userId
                    return (
                      <div key={collaborator.userId} className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {collaborator.profile.displayName}
                            {isOwnerRow ? ' (Owner)' : ''}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{collaborator.profile.username ? `@${collaborator.profile.username}` : 'No username'}</p>
                        </div>
                        {isOwner && !isOwnerRow ? (
                          <button
                            type="button"
                            onClick={() => onRemoveCollaborator(collaborator.userId)}
                            disabled={removingCollaboratorId === collaborator.userId}
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                            {removingCollaboratorId === collaborator.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Remove
                          </button>
                        ) : null}
                      </div>
                    )
                  })
                )}

                {showLeaveButton && !isOwner && currentUserId ? (
                  <button
                    type="button"
                    onClick={onLeave}
                    disabled={removingCollaboratorId === currentUserId}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    {removingCollaboratorId === currentUserId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Leave draft
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
