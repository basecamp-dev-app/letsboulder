import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DraftIntakeView from '@/features/submissions/components/DraftIntakeView'
import type { MediaUploadItem } from '@/features/submissions/upload/lib/upload-types'

const mockReplace = vi.fn()
const mockAddToast = vi.fn()
const mockRemoveToast = vi.fn()
const mockCreateSubmissionDraftAction = vi.fn()
const mockCsrfFetch = vi.fn()
const mockQueueDraftUploads = vi.fn()
const mockRegisterDraftUpdatedAt = vi.fn()
const mockGetUploadsForDraft = vi.fn()
const mockResumeQueue = vi.fn()
const mockRetryUpload = vi.fn()
const mockRemoveUpload = vi.fn()

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [], addToast: mockAddToast, removeToast: mockRemoveToast }),
}))

vi.mock('@/features/submissions/actions/manage-submissions', () => ({
  createSubmissionDraftAction: (...args: Parameters<typeof mockCreateSubmissionDraftAction>) => mockCreateSubmissionDraftAction(...args),
}))

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: (...args: Parameters<typeof mockCsrfFetch>) => mockCsrfFetch(...args),
}))

vi.mock('@/features/submissions/upload/hooks/use-draft-upload-manager', () => ({
  useDraftUploadManager: () => ({
    queueDraftUploads: mockQueueDraftUploads,
    registerDraftUpdatedAt: mockRegisterDraftUpdatedAt,
    getUploadsForDraft: mockGetUploadsForDraft,
    resumeQueue: mockResumeQueue,
    retryUpload: mockRetryUpload,
    removeUpload: mockRemoveUpload,
  }),
}))

function createUpload(overrides: Partial<MediaUploadItem> = {}): MediaUploadItem {
  return {
    clientId: 'upload-1',
    target: { kind: 'draft', draftId: 'draft-1' },
    fileName: 'route.jpg',
    status: 'SUCCESS',
    progress: 100,
    previewUrl: 'https://example.com/route.jpg',
    width: 1200,
    height: 900,
    uploadedImageId: null,
    uploadedBucket: null,
    uploadedPath: null,
    gpsData: null,
    captureDate: null,
    error: null,
    attachedRecordId: 'image-1',
    startedAt: 1,
    ...overrides,
  }
}

function createFile(name: string, type: string) {
  return new File(['file'], name, { type })
}

describe('DraftIntakeView', () => {
  beforeEach(() => {
    mockCreateSubmissionDraftAction.mockResolvedValue({
      success: true,
      data: { id: 'draft-1', updated_at: '2026-04-04T00:00:00.000Z' },
    })
    mockGetUploadsForDraft.mockReturnValue([])
    mockCsrfFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        draft: {
          id: 'draft-1',
          updated_at: '2026-04-04T01:00:00.000Z',
          images: [{ id: 'image-1', display_order: 0, proxy_url: 'https://example.com/route.jpg' }],
        },
      }),
    })
  })

  it('creates a draft and queues uploads after image selection', async () => {
    const user = userEvent.setup()

    render(<DraftIntakeView />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, createFile('one.jpg', 'image/jpeg'))

    await waitFor(() => {
      expect(mockCreateSubmissionDraftAction).toHaveBeenCalled()
      expect(mockRegisterDraftUpdatedAt).toHaveBeenCalledWith('draft-1', '2026-04-04T00:00:00.000Z')
      expect(mockQueueDraftUploads).toHaveBeenCalledWith([expect.objectContaining({ name: 'one.jpg' })], 'draft-1')
    })
  })

  it('opens the editor when attached images are ready', async () => {
    const user = userEvent.setup()

    mockGetUploadsForDraft.mockReturnValue([createUpload()])

    render(<DraftIntakeView />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, createFile('one.jpg', 'image/jpeg'))

    const continueButton = await screen.findByRole('button', { name: 'Continue to editor' })
    await user.click(continueButton)

    expect(mockReplace).toHaveBeenCalledWith('/logbook/drafts/draft-1/edit')
  })

  it('keeps continue disabled while uploads are still in flight', async () => {
    const user = userEvent.setup()

    mockGetUploadsForDraft.mockReturnValue([
      createUpload({
        clientId: 'uploading-1',
        status: 'UPLOADING',
        progress: 48,
        attachedRecordId: 'image-1',
      }),
    ])

    render(<DraftIntakeView />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, createFile('one.jpg', 'image/jpeg'))

    const continueButton = await screen.findByRole('button', { name: 'Finish uploads to continue' })
    expect(continueButton).toBeDisabled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('retries failed uploads from the error state', async () => {
    const user = userEvent.setup()

    mockGetUploadsForDraft.mockReturnValue([
      createUpload({ clientId: 'success-1', status: 'SUCCESS' }),
      createUpload({ clientId: 'failed-1', status: 'FAILED', error: 'Network error', attachedRecordId: null }),
    ])

    render(<DraftIntakeView />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, createFile('one.jpg', 'image/jpeg'))

    expect(await screen.findByText('Uploads complete with errors')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry failed' }))

    expect(mockRetryUpload).toHaveBeenCalledWith('failed-1')
    expect(mockResumeQueue).toHaveBeenCalledTimes(1)
  })

  it('shows an error toast when draft creation fails', async () => {
    mockCreateSubmissionDraftAction.mockResolvedValue({ success: false, error: 'No space left' })

    render(<DraftIntakeView />)

    fireEvent.drop(screen.getByText('Drop photos or click to select'), {
      dataTransfer: {
        files: [createFile('one.jpg', 'image/jpeg')],
      },
    })

    expect(await screen.findByText('No space left')).toBeInTheDocument()
    expect(mockAddToast).toHaveBeenCalledWith('No space left', 'error')
  })
})
