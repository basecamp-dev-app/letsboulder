import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LogbookView from '@/features/logbook/components/LogbookView'

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/grades/preferences', () => ({
  useGradeSystem: () => 'v_scale',
}))

function renderLogbook(overrides: Partial<React.ComponentProps<typeof LogbookView>> = {}) {
  render(
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
})
