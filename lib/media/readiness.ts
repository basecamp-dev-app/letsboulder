export const MEDIA_NOT_READY_CODE = 'media_not_ready'
export const MEDIA_NOT_READY_MESSAGE = 'Your photo is still being prepared. Publishing will be available when it’s ready.'
export const MEDIA_NOT_READY_RESPONSE = {
  code: MEDIA_NOT_READY_CODE,
  message: MEDIA_NOT_READY_MESSAGE,
  error: MEDIA_NOT_READY_MESSAGE,
} as const

export const MEDIA_PROCESSING_FAILED_RESPONSE = {
  code: 'media_processing_failed',
  message: 'Your photo could not be prepared. Remove it and upload it again before publishing.',
  error: 'Your photo could not be prepared. Remove it and upload it again before publishing.',
} as const

export const MEDIA_ASSOCIATION_BROKEN_RESPONSE = {
  code: 'media_association_broken',
  message: 'We could not prepare one of your photos for publishing. Remove it and upload it again.',
  error: 'We could not prepare one of your photos for publishing. Remove it and upload it again.',
} as const

export interface MediaReadinessRow {
  processing_status: string | null
  moderation_status: string | null
  visibility?: string | null
  status?: string | null
}

export function isMediaPublishable(row: MediaReadinessRow): boolean {
  return row.processing_status === 'ready'
    && (row.moderation_status === 'approved' || row.moderation_status === 'skipped')
}

export function isMediaPubliclyDeliverable(row: MediaReadinessRow): boolean {
  return isMediaPublishable(row) && row.visibility === 'public' && row.status === 'approved'
}

export function isMediaNotReadyError(error: { message?: string | null; details?: string | null }): boolean {
  return error.message?.includes(MEDIA_NOT_READY_MESSAGE) === true
    || error.details?.includes(MEDIA_NOT_READY_CODE) === true
}

export function isMediaAssociationError(error: { message?: string | null; details?: string | null }): boolean {
  return error.details?.includes(MEDIA_ASSOCIATION_BROKEN_RESPONSE.code) === true
    || error.message?.includes('missing its upload record') === true
    || error.message?.includes('does not match its upload record') === true
}
