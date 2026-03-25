import { csrfFetch } from '@/hooks/useCsrf'
import { uploadDebug } from '@/lib/media/upload-debug'

interface UploadSessionRequest {
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

const RETRYABLE_UPLOAD_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const UPLOAD_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000]

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
    body: JSON.stringify(payload),
    signal,
  })

  const data = await parseJson<UploadSessionResponse & { error?: string }>(response)
  if (!response.ok || !data) {
    throw new Error(data?.error || 'Failed to create upload session')
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

  uploadDebug('xhr-upload-failed-final', { message: lastError?.message || 'Upload failed' })
  throw lastError || new Error('Upload failed')
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
