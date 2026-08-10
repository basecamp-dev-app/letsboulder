'use client'

import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import LogbookView from '@/features/logbook/components/LogbookView'
import { useToast } from '@/hooks/use-toast'
import { ToastContainer } from '@/components/ui/toast'
import { deleteLogAction } from '@/features/logbook/actions/delete-log'
import { loadMorePublicLogsAction } from '@/features/logbook/actions/load-more-public-logs'
import {
  flattenPublicLogbookPages,
  flattenPublicProgressPages,
  publicLogbookQueryKey,
  type PublicLogbookPageData,
} from '@/features/logbook/lib/public-logbook-query'
import type { LogbookProfile } from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

interface PublicLogbookClientProps {
  userId: string
  initialPage: PublicLogbookPageData
}

export default function PublicLogbookClient({ userId, initialPage }: PublicLogbookClientProps) {
  const queryClient = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<PublicLogbookPageData, Error, InfiniteData<PublicLogbookPageData>, readonly ['logbook', 'public', string], string | null>({
    queryKey: publicLogbookQueryKey(userId),
    queryFn: async ({ pageParam }) => {
      const result = await loadMorePublicLogsAction(userId, pageParam)
      if (!result.success) {
        throw new Error(result.error)
      }

      return {
        logs: result.logs,
        progressLogs: result.progressLogs,
        nextCursor: result.nextCursor,
      }
    },
    initialPageParam: null as string | null,
    initialData: {
      pageParams: [null],
      pages: [initialPage],
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const logs = flattenPublicLogbookPages(data)
  const progressLogs = flattenPublicProgressPages(data)
  const lifetimeStats = data?.pages[0]?.lifetimeStats ?? initialPage.lifetimeStats
  const profile = (data?.pages[0]?.profile ?? initialPage.profile) as LogbookProfile | undefined
  const submissions = (data?.pages[0]?.submissions ?? initialPage.submissions ?? []) as Submission[]

  const handleDeleteLog = async (logId: string) => {
    try {
      const result = await deleteLogAction(logId)
      if (!result.success) throw new Error(result.error)
      await queryClient.invalidateQueries({ queryKey: publicLogbookQueryKey(userId) })
      addToast('Climb removed from logbook', 'success')
    } catch {
      addToast('Failed to remove climb', 'error')
    }
  }

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <LogbookView
        userId={userId}
        isOwnProfile={false}
        logs={logs}
        progressLogs={progressLogs}
        lifetimeStats={lifetimeStats}
        profile={profile}
        submissions={submissions}
        savedClimbs={[]}
        savedCrags={[]}
        hasMoreLogs={Boolean(hasNextPage)}
        isLoadingMoreLogs={isFetchingNextPage}
        deletingId={null}
        deletingDraftId={null}
        deletingSubmissionId={null}
        publishingDraftId={null}
        onDeleteLog={handleDeleteLog}
        onDeleteDraft={() => {}}
        onPublishDraft={() => {}}
        onDeleteSubmission={() => {}}
        onLoadMoreLogs={async () => {
          await fetchNextPage()
        }}
      />
    </>
  )
}
