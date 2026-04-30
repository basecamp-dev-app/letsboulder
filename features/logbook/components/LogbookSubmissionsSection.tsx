'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SubmissionList } from '@/features/submissions/public'
import {
  getOwnerSubmissionEmptyMessage,
  ownerSubmissionTabs,
  type OwnerSubmissionCounts,
  type OwnerSubmissionsTab,
} from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

interface LogbookSubmissionsSectionProps {
  isOwnProfile: boolean
  expanded: boolean
  submissions: Submission[]
  visibleSubmissions: Submission[]
  isLoading?: boolean
  ownerSubmissionTab: OwnerSubmissionsTab
  ownerSubmissionCounts: OwnerSubmissionCounts
  deletingDraftId: string | null
  publishingDraftId: string | null
  deletingSubmissionId: string | null
  onExpand: () => void
  onOwnerSubmissionTabChange: (tab: OwnerSubmissionsTab) => void
  onDeleteDraft: (draftId: string) => void
  onPublishDraft: (draftId: string) => void
  onDeleteSubmission: (canonicalImageId: string) => void
}

export function LogbookSubmissionsSection({
  isOwnProfile,
  expanded,
  submissions,
  visibleSubmissions,
  isLoading = false,
  ownerSubmissionTab,
  ownerSubmissionCounts,
  deletingDraftId,
  publishingDraftId,
  deletingSubmissionId,
  onExpand,
  onOwnerSubmissionTabChange,
  onDeleteDraft,
  onPublishDraft,
  onDeleteSubmission,
}: LogbookSubmissionsSectionProps) {
  return (
    <Card id="submissions" className="m-0 border-x-0 border-t-0 rounded-none scroll-mt-24">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{isOwnProfile ? 'Your submissions' : 'Contributions'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isOwnProfile && (
          <div className="mb-3 flex min-h-20 flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {ownerSubmissionTabs.map((tab) => {
                const isActive = ownerSubmissionTab === tab.id
                const count = ownerSubmissionCounts[tab.id]
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (!expanded) {
                        onExpand()
                      }
                      onOwnerSubmissionTabChange(tab.id)
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive && expanded
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              {!expanded ? (
                <button
                  type="button"
                  onClick={onExpand}
                  className="inline-flex rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Show submissions
                </button>
              ) : null}
              <Link
                href="/submit"
                prefetch={false}
                className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                New topo
              </Link>
            </div>
          </div>
        )}
        {!expanded ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
            Your submissions stay collapsed on entry to keep logbook navigation fast and stable offline.
          </p>
        ) : null}
        {isLoading ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
            Loading submissions...
          </p>
        ) : null}
        {isOwnProfile && !isLoading && visibleSubmissions.length === 0 ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
            {getOwnerSubmissionEmptyMessage(ownerSubmissionTab)}
          </p>
        ) : null}
        {expanded ? (
          <SubmissionList
            submissions={isOwnProfile ? visibleSubmissions : submissions}
            isOwnProfile={isOwnProfile}
            deletingDraftId={deletingDraftId}
            publishingDraftId={publishingDraftId}
            deletingSubmissionId={deletingSubmissionId}
            onDeleteDraft={onDeleteDraft}
            onPublishDraft={onPublishDraft}
            onDeleteSubmission={onDeleteSubmission}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
