import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/errors'
import type { MediaIngestJobPayload } from '@/lib/media/types'

const WORKER_ENQUEUE_TIMEOUT_MS = 5000

export function normalizeMediaWorkerBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Media worker URL is empty')

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported media worker URL protocol: ${parsed.protocol}`)
  }

  return parsed.toString().replace(/\/$/, '')
}

export async function enqueueMediaWorkerFastPath(payload: MediaIngestJobPayload): Promise<boolean> {
  const configuredWorkerUrl = serverEnv.CF_MEDIA_WORKER_URL
  const workerSecret = serverEnv.CF_MEDIA_WORKER_SECRET
  if (!configuredWorkerUrl || !workerSecret) return false

  try {
    const workerUrl = normalizeMediaWorkerBaseUrl(configuredWorkerUrl)
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
