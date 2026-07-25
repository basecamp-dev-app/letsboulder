export const MEDIA_NOT_READY_CODE = 'media_not_ready'
export const MEDIA_NOT_READY_MESSAGE = 'Some photos are still being prepared or reviewed.'
export const MEDIA_NOT_READY_RESPONSE = {
  code: MEDIA_NOT_READY_CODE,
  message: MEDIA_NOT_READY_MESSAGE,
  error: MEDIA_NOT_READY_MESSAGE,
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
