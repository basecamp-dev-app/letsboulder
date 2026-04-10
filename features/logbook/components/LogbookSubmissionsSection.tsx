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
  submissions: Submission[]
  visibleSubmissions: Submission[]
  isLoading?: boolean
  ownerSubmissionTab: OwnerSubmissionsTab
  ownerSubmissionCounts: OwnerSubmissionCounts
  deletingDraftId: string | null
  publishingDraftId: string | null
  deletingSubmissionId: string | null
  onOwnerSubmissionTabChange: (tab: OwnerSubmissionsTab) => void
  onDeleteDraft: (draftId: string) => void
  onPublishDraft: (draftId: string) => void
  onDeleteSubmission: (canonicalImageId: string) => void
}

export function LogbookSubmissionsSection({
  isOwnProfile,
  submissions,
  visibleSubmissions,
  isLoading = false,
  ownerSubmissionTab,
  ownerSubmissionCounts,
  deletingDraftId,
  publishingDraftId,
  deletingSubmissionId,
  onOwnerSubmissionTabChange,
  onDeleteDraft,
  onPublishDraft,
  onDeleteSubmission,
}: LogbookSubmissionsSectionProps) {
  return (
    <Card className="m-0 border-x-0 border-t-0 rounded-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{isOwnProfile ? 'Your submissions' : 'Contributions'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isOwnProfile && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {ownerSubmissionTabs.map((tab) => {
                const isActive = ownerSubmissionTab === tab.id
                const count = ownerSubmissionCounts[tab.id]
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onOwnerSubmissionTabChange(tab.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                )
              })}
            </div>
            <Link
              href="/submit"
              prefetch={false}
              className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              New upload
            </Link>
          </div>
        )}
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
      </CardContent>
    </Card>
  )
}
