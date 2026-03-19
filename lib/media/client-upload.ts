import { csrfFetch } from '@/hooks/useCsrf'

interface UploadSessionRequest {
  purpose: 'submission_image' | 'draft_image' | 'crag_image'
  contentType: string
  fileName: string
  byteSize: number
  width?: number | null
  height?: number | null
  draftId?: string | null
  cragId?: string | null
}

type UploadPurpose = UploadSessionRequest['purpose']

interface UploadSessionResponse {
  imageId: string
  objectKey: string
  bucket: string
  uploadUrl: string
  uploadMethod: 'PUT'
  uploadHeaders: Record<string, string>
  expiresInSeconds: number
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null)
}

export async function createMediaUploadSession(payload: UploadSessionRequest, signal?: AbortSignal): Promise<UploadSessionResponse> {
  const response = await csrfFetch('/api/media/upload-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  const data = await parseJson<UploadSessionResponse & { error?: string }>(response)
  if (!response.ok || !data) {
    throw new Error(data?.error || 'Failed to create upload session')
  }

  return data
}

export async function uploadFileToMediaSession(uploadUrl: string, uploadHeaders: Record<string, string>, file: Blob, signal?: AbortSignal) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: file,
    signal,
  })

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`)
  }
}

export async function completeMediaUploadSession(imageId: string, purpose: UploadPurpose = 'submission_image', signal?: AbortSignal) {
  const response = await csrfFetch(`/api/media/upload-sessions/${encodeURIComponent(imageId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose }),
    signal,
  })

  const data = await parseJson<{ error?: string }>(response)
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to finalize upload session')
  }
}

export async function deleteMediaUploadSession(imageId: string) {
  const response = await csrfFetch(`/api/media/upload-sessions/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
  })

  const data = await parseJson<{ error?: string }>(response)
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete upload session')
  }
}
