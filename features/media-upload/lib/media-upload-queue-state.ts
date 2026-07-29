import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'

export interface MediaUploadQueueState {
  uploads: Record<string, MediaUploadItem>
  queueOrder: string[]
  processingClientIds: Set<string>
  activeClientId: string | null
  isPaused: boolean
}

export function resetUploadForQueue(current: MediaUploadItem): MediaUploadItem {
  return {
    ...current,
    status: 'QUEUED',
    progress: 0,
    error: null,
  }
}

export function moveQueueItemToFront(queueOrder: string[], clientId: string) {
  return [clientId, ...queueOrder.filter((queuedClientId) => queuedClientId !== clientId)]
}

export function pickNextQueueClientId({ activeClientId, isPaused, processingClientIds, queueOrder, uploads }: MediaUploadQueueState) {
  if (isPaused || activeClientId) return null

  return queueOrder.find((clientId) => {
    if (processingClientIds.has(clientId)) return false
    const upload = uploads[clientId]
    return Boolean(upload && upload.status !== 'FAILED')
  }) || null
}
