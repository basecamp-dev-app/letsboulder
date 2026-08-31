'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import SubmissionList from '@/features/submissions/components/SubmissionList'
import { useSubmissions } from '@/features/submissions/hooks/useSubmissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SubmissionsTab = 'all' | 'drafts' | 'pending-review' | 'published'

const TABS: Array<{ id: SubmissionsTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'pending-review', label: 'Pending review' },
  { id: 'published', label: 'Published' },
]

function normalizeTab(value: string | null): SubmissionsTab {
  if (value === 'drafts' || value === 'published' || value === 'pending-review') return value
  return 'all'
}

export default function SubmissionListView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { submissions, loading, error, deletingDraftId, deletingSubmissionId, publishingDraftId, deleteDraft, deleteSubmission, publishDraft } = useSubmissions()

  const activeTab = normalizeTab(searchParams.get('tab'))

  const counts = useMemo(() => ({
    all: submissions.length,
    drafts: submissions.filter((submission) => submission.status === 'draft').length,
    'pending-review': submissions.filter((submission) => submission.status === 'pending_review').length,
    published: submissions.filter((submission) => submission.status === 'published').length,
  }), [submissions])

  const filteredSubmissions = useMemo(() => {
    if (activeTab === 'drafts') {
      return submissions.filter((submission) => submission.status === 'draft')
    }

    if (activeTab === 'pending-review') {
      return submissions.filter((submission) => submission.status === 'pending_review')
    }

    if (activeTab === 'published') {
      return submissions.filter((submission) => submission.status === 'published')
    }

    return submissions
  }, [activeTab, submissions])

  const handleTabChange = (tab: SubmissionsTab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="min-h-screen bg-white px-4 py-4 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Submissions</h1>
          <Link
            href="/submit"
            prefetch={false}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New upload
          </Link>
        </div>

        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardHeader className="pb-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {TABS.map((tab) => {
                const isActive = tab.id === activeTab
                const count = counts[tab.id]
                const hasPendingDrafts = tab.id === 'drafts' && count > 0
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : hasPendingDrafts
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                )
              })}
            </div>
            <CardTitle className="text-lg">Manage contributions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {error ? (
              <p className="py-4 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : loading ? (
              <p className="py-4 text-sm text-gray-500 dark:text-gray-400">Loading submissions...</p>
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-4 space-y-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeTab === 'drafts'
                    ? 'No drafts yet.'
                    : activeTab === 'pending-review'
                      ? 'No submissions pending review.'
                    : activeTab === 'published'
                      ? 'No published submissions yet.'
                      : 'No submissions yet.'}
                </p>
                <Link
                  href="/submit"
                  prefetch={false}
                  className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Start a new upload
                </Link>
              </div>
            ) : (
              <SubmissionList
                submissions={filteredSubmissions}
                isOwnProfile={true}
                deletingDraftId={deletingDraftId}
                publishingDraftId={publishingDraftId}
                deletingSubmissionId={deletingSubmissionId}
                onDeleteDraft={(draftIdToDelete) => {
                  void deleteDraft(draftIdToDelete)
                }}
                onDeleteSubmission={(imageIdToDelete) => {
                  void deleteSubmission(imageIdToDelete)
                }}
                onPublishDraft={(draftIdToPublish) => {
                  void publishDraft(draftIdToPublish).then((result) => {
                    if (result.ok && result.publiclyAvailable && result.imageId) {
                      const query = new URLSearchParams({
                        publishedFaces: String(result.imageCount),
                        publishedRoutes: String(result.routeCount),
                      })
                      router.push(`/logbook/submissions/${result.imageId}/edit?${query.toString()}`)
                    }
                  })
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
