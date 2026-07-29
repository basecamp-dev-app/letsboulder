import type { CragAttachResponse, DraftAttachResponse, MediaUploadItem, UploadCompleteCallback } from '@/features/media-upload/lib/upload-types'
import { csrfFetch } from '@/lib/csrf-client'

interface AttachUploadDependencies {
  uploadsRef: React.MutableRefObject<Record<string, MediaUploadItem>>
  alreadyAttachedRef: React.MutableRefObject<Set<string>>
  draftUpdatedAtRef: React.MutableRefObject<Map<string, string>>
  subscribersRef: React.MutableRefObject<Set<UploadCompleteCallback>>
  updateUpload: (clientId: string, updater: (current: MediaUploadItem) => MediaUploadItem) => void
}

export function createAttachUpload({
  uploadsRef,
  alreadyAttachedRef,
  draftUpdatedAtRef,
  subscribersRef,
  updateUpload,
}: AttachUploadDependencies) {
  return async function attachUpload(clientId: string) {
    if (alreadyAttachedRef.current.has(clientId)) return
    alreadyAttachedRef.current.add(clientId)

    const upload = uploadsRef.current[clientId]
    if (!upload || !upload.uploadedBucket || !upload.uploadedPath || !upload.uploadedImageId) {
      alreadyAttachedRef.current.delete(clientId)
      throw new Error('Upload is not ready to attach yet')
    }

    if (upload.target.kind === 'draft') {
      let attempts = 0
      while (attempts < 2) {
        attempts += 1
        const expectedUpdatedAt = draftUpdatedAtRef.current.get(upload.target.draftId)
        if (!expectedUpdatedAt) {
          throw new Error('Draft is not ready to receive uploads yet')
        }

        const response = await csrfFetch(`/api/submissions/drafts/${upload.target.draftId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_updated_at: expectedUpdatedAt,
            images: [{
              uploaded_image_id: upload.uploadedImageId,
              storage_bucket: upload.uploadedBucket,
              storage_path: upload.uploadedPath,
              gps_data: upload.gpsData,
              capture_date: upload.captureDate,
              width: upload.width,
              height: upload.height,
              route_data: {},
            }],
          }),
        })

        const payload = await response.json().catch(() => ({} as DraftAttachResponse))
        if (response.ok) {
          if (payload.draft?.updated_at) {
            draftUpdatedAtRef.current.set(upload.target.draftId, payload.draft.updated_at)
          }
          const attachedRecordId = Array.isArray(payload.draft?.appended_image_ids) ? payload.draft?.appended_image_ids[0] || null : null
          updateUpload(clientId, (current) => ({ ...current, attachedRecordId }))
          const newUpdatedAt = payload.draft?.updated_at || null
          subscribersRef.current.forEach((cb) => {
            try { cb(upload.target, clientId, attachedRecordId, newUpdatedAt) } catch {}
          })
          return
        }

        if (response.status === 409 && payload.code === 'draft_conflict' && payload.current_updated_at) {
          draftUpdatedAtRef.current.set(upload.target.draftId, payload.current_updated_at)
          continue
        }

        throw new Error(payload.error || 'Failed to attach upload to draft')
      }

      throw new Error('Draft changed while attaching upload. Please retry.')
    }

    const response = await csrfFetch(`/api/crags/${upload.target.cragId}/images/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [{ uploaded_image_id: upload.uploadedImageId }] }),
    })
    const payload = await response.json().catch(() => ({} as CragAttachResponse))
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to attach upload to crag')
    }
    const attachedRecordId = Array.isArray(payload.images) ? payload.images[0]?.id || null : null
    updateUpload(clientId, (current) => ({ ...current, attachedRecordId }))
    subscribersRef.current.forEach((cb) => {
      try { cb(upload.target, clientId, attachedRecordId) } catch {}
    })
  }
}
