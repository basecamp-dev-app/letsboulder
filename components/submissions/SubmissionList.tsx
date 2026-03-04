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
  onDeleteDraft: (draftId: string) => void
}

export default function SubmissionList({ submissions, isOwnProfile, deletingDraftId, onDeleteDraft }: SubmissionListProps) {
  return (
    <div className="space-y-0">
      {submissions.map((submission) => {
        const formattedHandle = formatSubmissionCreditHandle(submission.contribution_credit_handle)
        const draftHref = `/logbook/submissions?draftId=${submission.id}&from=contributions`

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
                    {submission.kind === 'draft' && (
                      <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        Draft
                      </span>
                    )}
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
                        Continue drawing
                      </Link>
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
