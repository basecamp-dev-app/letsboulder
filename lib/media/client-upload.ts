import { csrfFetch } from '@/lib/csrf-client'
import { uploadDebug, uploadDebugError } from '@/lib/media/upload-debug'
import type { MediaStatusResponse } from '@/lib/media/types'

interface UploadSessionRequest {
  clientUploadId: string
  purpose: 'submission_image' | 'draft_image' | 'crag_image'
  contentType: string
  fileName: string
  byteSize: number
  gpsData?: { latitude: number; longitude: number } | null
  captureDate?: string | null
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
  uploadCommitted?: boolean
}

interface UploadProgressDetails {
  progress: number
  loadedBytes: number
  totalBytes: number | null
}

interface UploadFileOptions {
  signal?: AbortSignal
  onProgress?: (details: UploadProgressDetails) => void
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const RETRYABLE_UPLOAD_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const UPLOAD_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000]
const STATUS_POLL_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 8000, 8000, 8000]

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null)
}

function createAbortError(): DOMException | Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Upload aborted', 'AbortError')
  }

  const error = new Error('Upload aborted')
  error.name = 'AbortError'
  return error
}

function normalizeUploadFileName(fileName: string | null | undefined, contentType: string): string {
  const trimmed = fileName?.trim()
  if (trimmed) return trimmed

  return `upload.${MIME_EXTENSION_MAP[contentType.toLowerCase()] || 'jpg'}`
}

function isRetryableUploadStatus(status: number): boolean {
  return RETRYABLE_UPLOAD_STATUSES.has(status)
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!delayMs) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)

    function handleAbort() {
      window.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      reject(createAbortError())
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function uploadFileWithXhr(uploadUrl: string, uploadHeaders: Record<string, string>, file: Blob, attemptNumber: number, options: UploadFileOptions = {}): Promise<void> {
  const { signal, onProgress } = options

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }

    const xhr = new XMLHttpRequest()

    uploadDebug('xhr-attempt-start', {
      attemptNumber,
      uploadUrl,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
    })

    const cleanup = () => {
      xhr.upload.onprogress = null
      xhr.onerror = null
      xhr.onabort = null
      xhr.onload = null
      signal?.removeEventListener('abort', handleAbort)
    }

    const handleAbort = () => {
      xhr.abort()
    }

    xhr.open('PUT', uploadUrl)
    Object.entries(uploadHeaders).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value)
    })

    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size || null
      const loadedBytes = event.loaded
      const progress = totalBytes && totalBytes > 0
        ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
        : 0
      onProgress?.({ progress, loadedBytes, totalBytes })
    }

    xhr.onerror = () => {
      cleanup()
      uploadDebug('xhr-attempt-network-error', { attemptNumber })
      reject(new Error('Upload failed due to a network error'))
    }

    xhr.onabort = () => {
      cleanup()
      uploadDebug('xhr-attempt-abort', { attemptNumber })
      reject(createAbortError())
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadDebug('xhr-attempt-success', { attemptNumber, status: xhr.status })
        onProgress?.({ progress: 100, loadedBytes: file.size, totalBytes: file.size || null })
        resolve()
        return
      }

      uploadDebug('xhr-attempt-http-error', { attemptNumber, status: xhr.status })
      reject(new Error(`Upload failed with status ${xhr.status}`))
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
    xhr.send(file)
  })
}

export async function createMediaUploadSession(payload: UploadSessionRequest, signal?: AbortSignal): Promise<UploadSessionResponse> {
  const response = await csrfFetch('/api/media/upload-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      fileName: normalizeUploadFileName(payload.fileName, payload.contentType),
    }),
    signal,
  })

  const data = await parseJson<UploadSessionResponse & { error?: string }>(response)
  if (!response.ok || !data) {
    const error = new Error(data?.error || `Failed to create upload session (status ${response.status})`)
    uploadDebugError('upload-session-create-failed', error, { status: response.status })
    throw error
  }

  return data
}

export async function uploadFileToMediaSession(uploadUrl: string, uploadHeaders: Record<string, string>, file: Blob, options: UploadFileOptions = {}) {
  let lastError: Error | null = null

  for (let attemptIndex = 0; attemptIndex < UPLOAD_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1
    if (options.signal?.aborted) {
      throw createAbortError()
    }

    try {
      await uploadFileWithXhr(uploadUrl, uploadHeaders, file, attemptNumber, options)
      uploadDebug('xhr-upload-finished', { attemptNumber, attemptsUsed: attemptNumber })
      return
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error('Upload failed')
      const isAbortError = uploadError.name === 'AbortError'
      if (isAbortError) {
        uploadDebug('xhr-upload-aborted', { attemptNumber })
        throw uploadError
      }

      lastError = uploadError
      const statusMatch = /status (\d{3})/.exec(uploadError.message)
      const statusCode = statusMatch ? Number(statusMatch[1]) : null
      const shouldRetry = statusCode === null || isRetryableUploadStatus(statusCode)
      uploadDebug('xhr-upload-attempt-failed', {
        attemptNumber,
        statusCode,
        shouldRetry,
        message: uploadError.message,
      })
      if (!shouldRetry || attemptIndex === UPLOAD_RETRY_DELAYS_MS.length - 1) {
        break
      }

      uploadDebug('xhr-upload-retrying', {
        nextAttemptNumber: attemptNumber + 1,
        delayMs: UPLOAD_RETRY_DELAYS_MS[attemptIndex],
      })
      await waitForRetry(UPLOAD_RETRY_DELAYS_MS[attemptIndex], options.signal)
    }
  }

  uploadDebugError('xhr-upload-failed-final', lastError || new Error('Upload failed'), {
    fileSize: file.size,
    contentType: file.type || 'application/octet-stream',
  })
  throw lastError || new Error('Upload failed')
}

export async function completeMediaUploadSession(imageId: string, purpose: UploadPurpose = 'submission_image', signal?: AbortSignal): Promise<MediaStatusResponse> {
  const response = await csrfFetch(`/api/media/upload-sessions/${encodeURIComponent(imageId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose }),
    signal,
  })

  const data = await parseJson<MediaStatusResponse & { error?: string }>(response)
  if (!response.ok || !data) {
    const error = new Error(data?.error || `Failed to finalize upload session (status ${response.status})`)
    uploadDebugError('upload-session-complete-failed', error, { imageId, status: response.status })
    throw error
  }

  return data
}

export async function getMediaUploadStatus(imageId: string, signal?: AbortSignal): Promise<MediaStatusResponse> {
  const response = await fetch(`/api/media/upload-sessions/${encodeURIComponent(imageId)}`, { signal })
  const data = await parseJson<MediaStatusResponse & { error?: string }>(response)
  if (!response.ok || !data) {
    const error = new Error(data?.error || `Failed to get upload status (status ${response.status})`)
    uploadDebugError('upload-status-failed', error, { imageId, status: response.status })
    throw error
  }

  return data
}

export async function pollMediaUploadStatus(
  imageId: string,
  signal?: AbortSignal,
  onStatus?: (status: MediaStatusResponse) => void
): Promise<MediaStatusResponse> {
  let attempt = 0
  while (true) {
    try {
      const status = await getMediaUploadStatus(imageId, signal)
      onStatus?.(status)
      const moderationFinished = status.moderationStatus !== 'pending'
      if (status.processingStatus === 'failed' || (status.processingStatus === 'ready' && moderationFinished)) {
        return status
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    }

    const delayMs = STATUS_POLL_DELAYS_MS[Math.min(attempt, STATUS_POLL_DELAYS_MS.length - 1)]
    attempt += 1
    await waitForRetry(delayMs, signal)
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
