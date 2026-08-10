import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LogbookView from '@/features/logbook/components/LogbookView'

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock('next/dynamic', () => ({
  default: () => (props: { expanded: boolean; onExpand: () => void }) => (
    <button type="button" data-testid="submissions" data-expanded={props.expanded} onClick={props.onExpand} />
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/logbook',
  useRouter: () => ({ push: navigationMocks.push }),
  useSearchParams: () => navigationMocks.searchParams,
}))

vi.mock('@/lib/grades/preferences', () => ({
  useGradeSystem: () => 'v_scale',
}))

function renderLogbook(overrides: Partial<React.ComponentProps<typeof LogbookView>> = {}) {
  return render(
    <LogbookView
      userId="user-1"
      isOwnProfile={true}
      logs={[]}
      submissions={[]}
      submissionCounts={{ all: 0, drafts: 0, 'pending-review': 0, published: 0 }}
      savedClimbs={[]}
      savedCrags={[]}
      hasMoreLogs={false}
      isLoadingMoreLogs={false}
      deletingId={null}
      deletingDraftId={null}
      deletingSubmissionId={null}
      publishingDraftId={null}
      onDeleteLog={vi.fn()}
      onDeleteDraft={vi.fn()}
      onPublishDraft={vi.fn()}
      onDeleteSubmission={vi.fn()}
      onLoadMoreLogs={vi.fn()}
      {...overrides}
    />
  )
}

describe('LogbookView states', () => {
  beforeEach(() => {
    navigationMocks.push.mockReset()
    navigationMocks.searchParams = new URLSearchParams()
  })

  it('renders the genuine empty state once', () => {
    renderLogbook()

    expect(screen.getAllByText('No climbs logged yet')).toHaveLength(1)
  })

  it('renders a retryable failure instead of the empty state', () => {
    const onRetry = vi.fn()
    renderLogbook({ isError: true, onRetry })

    expect(screen.getByRole('alert')).toHaveTextContent('Logbook could not be loaded')
    expect(screen.queryByText('No climbs logged yet')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('derives submission expansion from the current URL', () => {
    const { rerender } = renderLogbook()
    expect(screen.getByTestId('submissions')).toHaveAttribute('data-expanded', 'false')

    fireEvent.click(screen.getByTestId('submissions'))
    expect(navigationMocks.push).toHaveBeenCalledWith('/logbook?section=submissions', { scroll: false })

    navigationMocks.searchParams = new URLSearchParams('section=submissions')
    rerender(
      <LogbookView
        userId="user-1"
        isOwnProfile={true}
        logs={[]}
        submissions={[]}
        submissionCounts={{ all: 0, drafts: 0, 'pending-review': 0, published: 0 }}
        savedClimbs={[]}
        savedCrags={[]}
        hasMoreLogs={false}
        isLoadingMoreLogs={false}
        deletingId={null}
        deletingDraftId={null}
        deletingSubmissionId={null}
        publishingDraftId={null}
        onDeleteLog={vi.fn()}
        onDeleteDraft={vi.fn()}
        onPublishDraft={vi.fn()}
        onDeleteSubmission={vi.fn()}
        onLoadMoreLogs={vi.fn()}
      />
    )

    expect(screen.getByTestId('submissions')).toHaveAttribute('data-expanded', 'true')
  })
})
