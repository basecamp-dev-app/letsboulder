'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { formatSubmissionCreditHandle } from '@/lib/submission-credit'
import type { Submission } from '@/types/submissions'

interface SubmissionListProps {
  submissions: Submission[]
  isOwnProfile: boolean
  deletingDraftId: string | null
  publishingDraftId: string | null
  onDeleteDraft: (draftId: string) => void
  onPublishDraft: (draftId: string) => void
}

interface PendingAction {
  draftId: string
  type: 'publish' | 'delete'
}

export default function SubmissionList({ submissions, isOwnProfile, deletingDraftId, publishingDraftId, onDeleteDraft, onPublishDraft }: SubmissionListProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [deleteRouteConfirmation, setDeleteRouteConfirmation] = useState('')

  const pendingSubmission = useMemo(
    () => submissions.find((submission) => submission.id === pendingAction?.draftId) ?? null,
    [pendingAction, submissions]
  )

  const isConfirmLoading = pendingAction?.type === 'publish'
    ? publishingDraftId === pendingAction.draftId
    : pendingAction?.type === 'delete'
      ? deletingDraftId === pendingAction.draftId
      : false

  const pendingDeleteRouteCount = pendingSubmission?.route_lines_count ?? 0
  const requiresRouteConfirmation = pendingAction?.type === 'delete' && pendingDeleteRouteCount > 0
  const isDeleteConfirmationValid = !requiresRouteConfirmation || deleteRouteConfirmation.trim() === String(pendingDeleteRouteCount)

  const handleConfirmAction = () => {
    if (!pendingAction) return
    if (pendingAction.type === 'delete' && !isDeleteConfirmationValid) return

    const action = pendingAction
    setPendingAction(null)

    if (action.type === 'publish') {
      onPublishDraft(action.draftId)
      return
    }

    onDeleteDraft(action.draftId)
  }

  const openPendingAction = (action: PendingAction) => {
    setDeleteRouteConfirmation('')
    setPendingAction(action)
  }

  return (
    <>
      <div className="space-y-0">
        {submissions.map((submission) => {
        const formattedHandle = formatSubmissionCreditHandle(submission.contribution_credit_handle)
        const visibilityLabel = submission.is_anonymous_submission ? 'Anonymous' : formattedHandle
        const draftHref = `/logbook/drafts/${submission.id}/edit`
        const isOptimisticPublishing = submission.is_optimistic && submission.status === 'pending_review'
        const isDraftActionsVisible = submission.kind === 'draft' && submission.status === 'draft' && !isOptimisticPublishing
        const statusLabel = isOptimisticPublishing
          ? 'Publishing'
          : submission.status === 'draft'
          ? 'Draft'
          : submission.status === 'pending_review'
            ? 'Processing'
            : 'Published'
        const statusClassName = isOptimisticPublishing
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
          : submission.status === 'draft'
          ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          : submission.status === 'pending_review'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
            : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
        const destinationHref = submission.kind === 'draft'
          ? draftHref
          : submission.canonical_image_id
            ? `/image/${submission.canonical_image_id}`
            : `/image/${submission.id}`
        const manageHref = submission.canonical_image_id
          ? `/logbook/submissions/${submission.canonical_image_id}/edit`
          : `/logbook/submissions/${submission.id}/edit`
        const imageSrcRaw = resolveRouteImageUrl(submission.url)
        const imageSrc = typeof imageSrcRaw === 'string' && imageSrcRaw.trim().length > 0 ? imageSrcRaw : null
        const content = (
          <>
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt="Submitted route image"
                width={48}
                height={48}
                sizes="48px"
                unoptimized={submission.kind === 'draft'}
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-12 w-12 shrink-0 rounded bg-gray-100 dark:bg-gray-800"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {submission.crag_name || 'Unknown crag'}
                <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClassName}`}>
                  {statusLabel}
                </span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {submission.route_lines_count} route{submission.route_lines_count === 1 ? '' : 's'}
                {submission.kind === 'submitted' && (submission.image_count || 0) > 1
                  ? ` • ${submission.image_count} images`
                  : ''}
                {' • '}
                {new Date(submission.updated_at).toLocaleDateString()}
                {visibilityLabel ? ` • ${visibilityLabel}` : ''}
              </p>
            </div>
          </>
        )

          return (
            <div
              key={submission.id}
              className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              <div className="flex items-center gap-3">
                {isOptimisticPublishing ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-sm opacity-80">
                    {content}
                  </div>
                ) : (
                  <Link
                    href={destinationHref}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 rounded-sm"
                  >
                    {content}
                  </Link>
                )}

                {isOwnProfile && (
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {isDraftActionsVisible ? (
                      <>
                        <Link
                          href={draftHref}
                          className="text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                          Edit draft
                        </Link>
                        {publishingDraftId === submission.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPendingAction({ draftId: submission.id, type: 'publish' })}
                            className="text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
                          >
                            Publish
                          </button>
                        )}
                        {deletingDraftId === submission.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPendingAction({ draftId: submission.id, type: 'delete' })}
                            className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                            title="Delete draft"
                            aria-label="Delete draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    ) : isOptimisticPublishing ? (
                      <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Publishing...
                      </div>
                    ) : (
                      <Link
                        href={manageHref}
                        className="text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        Manage
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.type === 'publish' ? 'Publish this draft?' : 'Delete this draft?'}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.type === 'publish'
                ? `This will submit ${pendingSubmission?.crag_name || 'this draft'} for review and move it out of drafts.`
                : `This will permanently remove ${pendingSubmission?.crag_name || 'this draft'} from your drafts.`}
            </DialogDescription>
          </DialogHeader>
          {pendingAction?.type === 'delete' ? (
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/60">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {pendingSubmission?.crag_name || 'Unknown crag'}
                </div>
                <div>{pendingDeleteRouteCount} route{pendingDeleteRouteCount === 1 ? '' : 's'}</div>
                <div>Submitted {pendingSubmission ? new Date(pendingSubmission.created_at).toLocaleDateString() : 'unknown date'}</div>
              </div>

              {requiresRouteConfirmation ? (
                <div className="space-y-2">
                  <label htmlFor="delete-route-confirmation" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    Type the route count to confirm deletion
                  </label>
                  <Input
                    id="delete-route-confirmation"
                    inputMode="numeric"
                    value={deleteRouteConfirmation}
                    onChange={(event) => setDeleteRouteConfirmation(event.target.value)}
                    placeholder={`Enter ${pendingDeleteRouteCount}`}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This draft has no routes, so you can confirm immediately.
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
              disabled={!pendingAction || isConfirmLoading || !isDeleteConfirmationValid}
            >
              {pendingAction?.type === 'publish' ? 'Confirm publish' : 'Confirm delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
