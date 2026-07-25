import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CF_MEDIA_WORKER_URL: 'https://media-worker.example/',
    CF_MEDIA_WORKER_SECRET: 'worker-secret',
  },
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { reportError } from '@/lib/errors'
import { enqueueMediaWorkerFastPath } from '@/lib/media/worker-enqueue'

const payload = {
  imageId: '5a60f240-df39-4d64-8689-6176539f09a4',
  originalBucket: 'private-media',
  originalKey: 'images/originals/5a60f240-df39-4d64-8689-6176539f09a4/original.jpg',
  storageProvider: 'r2' as const,
  purpose: 'draft_image' as const,
  triggeredByUserId: '7e408073-6176-44b8-9957-4650ce485c51',
  trigger: 'upload' as const,
}

describe('enqueueMediaWorkerFastPath', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('dispatches the durable payload to the worker queue', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(enqueueMediaWorkerFastPath(payload)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://media-worker.example/enqueue', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer worker-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }))
  })

  it('keeps durable processing available when immediate dispatch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))

    await expect(enqueueMediaWorkerFastPath(payload)).resolves.toBe(false)
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      message: 'Media worker fast-path enqueue failed; durable processing remains queued',
    }))
  })
})
