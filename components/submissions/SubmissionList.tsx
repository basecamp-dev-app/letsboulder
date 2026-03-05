'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Loader2, Trash2 } from 'lucide-react'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
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

export default function SubmissionList({ submissions, isOwnProfile, deletingDraftId, publishingDraftId, onDeleteDraft, onPublishDraft }: SubmissionListProps) {
  return (
    <div className="space-y-0">
      {submissions.map((submission) => {
        const formattedHandle = formatSubmissionCreditHandle(submission.contribution_credit_handle)
        const draftHref = `/logbook/drafts/${submission.id}/edit`
        const statusLabel = submission.status === 'draft'
          ? 'Draft'
          : submission.status === 'pending_review'
            ? 'Pending review'
            : 'Published'
        const statusClassName = submission.status === 'draft'
          ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          : submission.status === 'pending_review'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
            : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'

        return (
          <div
            key={submission.id}
            className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <div className="flex items-center gap-3">
              <Link
                href={submission.kind === 'draft' ? draftHref : `/image/${submission.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/40 rounded-sm"
              >
                <Image
                  src={resolveRouteImageUrl(submission.url)}
                  alt="Submitted route image"
                  width={48}
                  height={48}
                  unoptimized
                  className="w-12 h-12 object-cover rounded"
                />
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
                    {formattedHandle ? ` • ${formattedHandle}` : ''}
                  </p>
                </div>
              </Link>

              {isOwnProfile && (
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {submission.kind === 'draft' ? (
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
                          onClick={() => onPublishDraft(submission.id)}
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
                          onClick={() => onDeleteDraft(submission.id)}
                          className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                          title="Delete draft"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <Link
                      href={`/logbook/submissions/${submission.id}/edit`}
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
  )
}
