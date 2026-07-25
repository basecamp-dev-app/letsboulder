import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/errors'
import type { MediaIngestJobPayload } from '@/lib/media/types'

const WORKER_ENQUEUE_TIMEOUT_MS = 5000

export async function enqueueMediaWorkerFastPath(payload: MediaIngestJobPayload): Promise<boolean> {
  const workerUrl = serverEnv.CF_MEDIA_WORKER_URL?.replace(/\/$/, '')
  const workerSecret = serverEnv.CF_MEDIA_WORKER_SECRET
  if (!workerUrl || !workerSecret) return false

  try {
    const response = await fetch(`${workerUrl}/enqueue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WORKER_ENQUEUE_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`Media worker enqueue returned HTTP ${response.status}`)
    }

    return true
  } catch (error) {
    reportError(error, {
      message: 'Media worker fast-path enqueue failed; durable processing remains queued',
      extra: { imageId: payload.imageId },
    })
    return false
  }
}
