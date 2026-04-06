import { deleteMediaUploadSession } from '@/lib/media/client-upload'
import { moveQueueItemToFront, resetUploadForQueue } from '@/features/media-upload/lib/media-upload-queue-state'
import { uploadDebug } from '@/lib/media/upload-debug'
import type { MediaUploadItem, QueueEntry } from '@/features/media-upload/lib/upload-types'

export function enqueueUploads<TUpload extends MediaUploadItem>(
  currentUploads: Record<string, TUpload>,
  currentQueueOrder: string[],
  createdUploads: TUpload[]
) {
  const nextUploads = { ...currentUploads }
  createdUploads.forEach((upload) => {
    nextUploads[upload.clientId] = upload
  })

  return {
    nextUploads,
    nextQueueOrder: [...currentQueueOrder, ...createdUploads.map((upload) => upload.clientId)],
  }
}

export function prepareRetryQueue(queueOrder: string[], clientId: string) {
  return moveQueueItemToFront(queueOrder, clientId)
}

export function resetQueuedUpload(upload: MediaUploadItem) {
  return resetUploadForQueue(upload)
}

export async function removeUploadEntry(params: {
  clientId: string
  uploads: Record<string, MediaUploadItem>
  queueOrder: string[]
  queueEntries: Map<string, QueueEntry>
  alreadyAttached: Set<string>
  processingClientIds: Set<string>
  revokePreviewUrl: (clientId: string) => void
}) {
  const { clientId, uploads, queueOrder, queueEntries, alreadyAttached, processingClientIds, revokePreviewUrl } = params
  const upload = uploads[clientId]
  if (!upload) {
    return {
      nextUploads: uploads,
      nextQueueOrder: queueOrder,
      removedActiveClient: false,
    }
  }

  if (upload.uploadedImageId) {
    await deleteMediaUploadSession(upload.uploadedImageId).catch(() => null)
  }

  revokePreviewUrl(clientId)
  const nextUploads = { ...uploads }
  delete nextUploads[clientId]
  queueEntries.delete(clientId)
  alreadyAttached.delete(clientId)
  processingClientIds.delete(clientId)

  const nextQueueOrder = queueOrder.filter((queuedClientId) => queuedClientId !== clientId)
  uploadDebug('queue-item-removed', { clientId })

  return {
    nextUploads,
    nextQueueOrder,
    removedActiveClient: true,
  }
}
