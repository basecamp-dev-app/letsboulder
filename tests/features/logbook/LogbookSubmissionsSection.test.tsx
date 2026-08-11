import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogbookSubmissionsSection } from '@/features/logbook/components/LogbookSubmissionsSection'
import type { Submission } from '@/types/submissions'

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
}))

vi.mock('@/features/submissions/public-client', () => ({
  SubmissionList: ({ submissions }: { submissions: Submission[] }) => (
    <div data-testid="submission-list">{submissions.map((submission) => submission.id).join(',')}</div>
  ),
}))

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'submission-1',
    status: 'draft',
    image_ids: [],
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
    canonical_image_id: null,
    ...overrides,
  } as Submission
}

function renderSection(overrides: Partial<React.ComponentProps<typeof LogbookSubmissionsSection>> = {}) {
  const onExpand = vi.fn()

  render(
    <LogbookSubmissionsSection
      isOwnProfile={true}
      expanded={false}
      submissions={[createSubmission()]}
      visibleSubmissions={[]}
      ownerSubmissionTab="all"
      ownerSubmissionCounts={{ all: 3, drafts: 1, 'pending-review': 1, published: 1 }}
      deletingDraftId={null}
      publishingDraftId={null}
      deletingSubmissionId={null}
      onExpand={onExpand}
      onOwnerSubmissionTabChange={vi.fn()}
      onDeleteDraft={vi.fn()}
      onPublishDraft={vi.fn()}
      onDeleteSubmission={vi.fn()}
      {...overrides}
    />
  )

  return { onExpand }
}

describe('LogbookSubmissionsSection', () => {
  it('stays collapsed by default and shows the summary message', () => {
    renderSection()

    expect(screen.getByText('Your submissions stay collapsed on entry to keep logbook navigation fast and responsive.')).toBeInTheDocument()
    expect(screen.queryByTestId('submission-list')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show submissions' })).toBeInTheDocument()
  })

  it('renders owner summary counts without expanding the list', () => {
    renderSection()

    expect(screen.getByRole('button', { name: 'All (3)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drafts (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pending review \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Published (1)' })).toBeInTheDocument()
    expect(screen.queryByTestId('submission-list')).not.toBeInTheDocument()
  })

  it('calls expand when the user opens submissions', () => {
    const { onExpand } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Show submissions' }))

    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('renders visible submissions after expansion', () => {
    renderSection({
      expanded: true,
      visibleSubmissions: [createSubmission({ id: 'draft-1' }), createSubmission({ id: 'draft-2', status: 'published' })],
    })

    expect(screen.getByTestId('submission-list')).toHaveTextContent('draft-1,draft-2')
    expect(screen.queryByText('Your submissions stay collapsed on entry to keep logbook navigation fast and responsive.')).not.toBeInTheDocument()
  })
})
