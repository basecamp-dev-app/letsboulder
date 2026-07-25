import type { Database } from '@/types/database'
import type { MediaStatusResponse } from '@/lib/media/types'

type ImageRow = Database['public']['Tables']['images']['Row']
type MediaJobRow = Database['public']['Tables']['media_jobs']['Row']

type StatusImage = Pick<ImageRow, 'id' | 'processing_status' | 'moderation_status' | 'visibility' | 'status'>
type StatusJob = Pick<MediaJobRow, 'status' | 'attempts' | 'max_attempts'>

export function toMediaStatusResponse(image: StatusImage, latestJob: StatusJob | null): MediaStatusResponse {
  if (image.processing_status === 'ready') {
    const moderationStatus = image.moderation_status === 'approved'
      || image.moderation_status === 'rejected'
      || image.moderation_status === 'skipped'
      || image.moderation_status === 'error'
      ? image.moderation_status
      : 'pending'
    const isPublic = image.visibility === 'public' && image.status === 'approved'
    return {
      imageId: image.id,
      processingStatus: 'ready',
      moderationStatus,
      retryable: false,
      errorCode: moderationStatus !== 'pending' && moderationStatus !== 'rejected' && moderationStatus !== 'error' && !isPublic
        ? 'MEDIA_NOT_PUBLIC'
        : null,
    }
  }

  if (image.processing_status === 'failed' || latestJob?.status === 'failed' || latestJob?.status === 'cancelled') {
    return {
      imageId: image.id,
      processingStatus: 'failed',
      moderationStatus: image.moderation_status === 'error' ? 'error' : 'skipped',
      retryable: latestJob !== null && latestJob.attempts < latestJob.max_attempts,
      errorCode: latestJob?.status === 'cancelled' ? 'MEDIA_JOB_CANCELLED' : 'MEDIA_PROCESSING_FAILED',
    }
  }

  return {
    imageId: image.id,
    processingStatus: image.processing_status === 'processing' || latestJob?.status === 'processing'
      ? 'processing'
      : 'queued',
    moderationStatus: image.moderation_status === 'approved' || image.moderation_status === 'skipped'
      ? image.moderation_status
      : 'pending',
    retryable: false,
    errorCode: null,
  }
}
