import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftUploadQueue } from '@/features/media-upload/components/DraftUploadQueue'
import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'

function createUpload(overrides: Partial<MediaUploadItem> = {}): MediaUploadItem {
  return {
    clientId: 'upload-1',
    target: { kind: 'draft', draftId: 'draft-1' },
    fileName: 'route.jpg',
    status: 'QUEUED',
    progress: 0,
    previewUrl: 'https://example.com/preview.jpg',
    width: 1200,
    height: 900,
    uploadedImageId: null,
    uploadedBucket: null,
    uploadedPath: null,
    gpsData: null,
    captureDate: null,
    error: null,
    attachedRecordId: null,
    startedAt: 1,
    ...overrides,
  }
}

describe('DraftUploadQueue', () => {
  it('shows paused state and resumes the queue', async () => {
    const onResumeQueue = vi.fn()
    const user = userEvent.setup()

    render(
      <DraftUploadQueue
        pendingDraftUploads={[createUpload()]}
        queuePaused
        draftId="draft-1"
        hasPendingUploads={() => true}
        hasFailedUploads={() => false}
        onRetryUpload={vi.fn()}
        onRemoveUpload={vi.fn()}
        onResumeQueue={onResumeQueue}
      />
    )

    expect(screen.getByText('Queue paused')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResumeQueue).toHaveBeenCalledTimes(1)
  })

  it('shows retry and delete actions for failed uploads', async () => {
    const onRetryUpload = vi.fn()
    const onRemoveUpload = vi.fn()
    const user = userEvent.setup()

    render(
      <DraftUploadQueue
        pendingDraftUploads={[createUpload({ clientId: 'failed-1', status: 'FAILED', error: 'Network error' })]}
        queuePaused={false}
        draftId="draft-1"
        hasPendingUploads={() => false}
        hasFailedUploads={() => true}
        onRetryUpload={onRetryUpload}
        onRemoveUpload={onRemoveUpload}
        onResumeQueue={vi.fn()}
      />
    )

    expect(screen.getByText('Attention needed')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onRetryUpload).toHaveBeenCalledWith('failed-1')
    expect(onRemoveUpload).toHaveBeenCalledWith('failed-1')
  })
})
