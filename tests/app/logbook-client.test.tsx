import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogbookClient from '@/app/(shell)/logbook/LogbookClient'
import type { OwnLogbookData } from '@/features/logbook/lib/queries'

const mocks = vi.hoisted(() => ({
  deleteLogAction: vi.fn(),
  loadMoreLogbookAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/features/logbook/actions/delete-log', () => ({ deleteLogAction: mocks.deleteLogAction }))
vi.mock('@/features/logbook/actions/load-more-logbook', () => ({ loadMoreLogbookAction: mocks.loadMoreLogbookAction }))
vi.mock('@/features/submissions/public-actions', () => ({
  deletePublishedSubmissionAction: vi.fn(),
  deleteSubmissionDraftAction: vi.fn(),
  publishSubmissionDraftAction: vi.fn(),
}))
vi.mock('@/features/logbook/components/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/features/logbook/components/LogbookView', () => ({
  default: ({ logs, onDeleteLog }: { logs: Array<{ id: string }>; onDeleteLog: (logId: string) => void }) => (
    <>
      <output data-testid="log-ids">{logs.map((log) => log.id).join(',')}</output>
      <button type="button" onClick={() => onDeleteLog('old-log')}>Delete old log</button>
    </>
  ),
}))

const user = { id: 'user-1' } as User

function makeLog(id: string) {
  return {
    id,
    climb_id: `climb-${id}`,
    style: 'top',
    created_at: '2026-08-11T12:00:00.000Z',
    climbs: {
      id: `climb-${id}`,
      name: `Climb ${id}`,
      grade: '6A',
      crags: { name: 'Test crag' },
    },
  }
}

function makeInitialData(): OwnLogbookData {
  return {
    user,
    userId: user.id,
    isOwnProfile: true,
    isPublic: true,
    logs: [makeLog('old-log')],
    progressLogs: [],
    nextCursor: null,
    lifetimeStats: { totalClimbs: 1, totalFlashes: 0, totalTops: 1, totalTries: 0 },
    profile: null,
    submissions: [],
    savedClimbs: [],
    savedCrags: [],
    submissionCounts: { all: 0, drafts: 0, 'pending-review': 0, published: 0 },
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('LogbookClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteLogAction.mockResolvedValue({ success: true })
    mocks.loadMoreLogbookAction.mockResolvedValue({
      success: true,
      logs: [makeLog('fresh-log')],
      progressLogs: [],
      nextCursor: null,
    })
  })

  it('refetches the invalidated first log page with its null cursor', async () => {
    render(<LogbookClient user={user} initialData={makeInitialData()} />, { wrapper: createWrapper() })

    expect(screen.getByTestId('log-ids')).toHaveTextContent(/^old-log$/)
    expect(mocks.loadMoreLogbookAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete old log' }))

    await waitFor(() => {
      expect(mocks.loadMoreLogbookAction).toHaveBeenCalledOnce()
      expect(mocks.loadMoreLogbookAction).toHaveBeenCalledWith(user.id, null, 'owner')
      expect(screen.getByTestId('log-ids')).toHaveTextContent(/^fresh-log$/)
    })
  })
})
