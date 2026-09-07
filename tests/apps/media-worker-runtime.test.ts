import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  baseQueue,
  deletionDrain,
  processJob,
  pruneDeletion,
  queueSend,
  rpc,
} = vi.hoisted(() => ({
  baseQueue: vi.fn(),
  deletionDrain: vi.fn(),
  processJob: vi.fn(),
  pruneDeletion: vi.fn(),
  queueSend: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/apps/media-worker/src/index', () => ({
  default: {
    fetch: vi.fn(async () => new Response('ok')),
    queue: baseQueue,
  },
  processJob,
}))

vi.mock('@/apps/media-worker/src/deletion-outbox', () => ({
  drainMediaDeletionOutbox: deletionDrain,
  pruneMediaDeletionOutbox: pruneDeletion,
}))

vi.mock('@/apps/media-worker/src/supabase', () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}))

import mediaRuntime, { drainMediaOutboxBounded } from '@/apps/media-worker/src/runtime'

const imageId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'

function job(index: number) {
  return {
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    image_id: imageId,
    job_type: 'ingest_image',
    status: 'processing',
    payload: {
      imageId,
      originalBucket: 'lb-prod-media-private',
      originalKey: `images/originals/${imageId}/source.jpg`,
      storageProvider: 'r2',
      purpose: 'draft_image',
      triggeredByUserId: userId,
    },
    attempts: 1,
    max_attempts: 8,
    run_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    locked_by: 'media-worker-scheduled',
    claim_token: '55555555-5555-4555-8555-555555555555',
    lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function env() {
  return {
    MEDIA_QUEUE: { send: queueSend },
  } as never
}

describe('bounded media recovery runtime', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    processJob.mockResolvedValue(undefined)
    deletionDrain.mockResolvedValue(0)
    pruneDeletion.mockResolvedValue(0)
  })

  it('processes at most four durable media jobs per invocation and completes after processing', async () => {
    const events: string[] = []
    let claimCount = 0

    processJob.mockImplementation(async () => {
      events.push('process')
    })
    rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_media_job') {
        claimCount += 1
        return { data: job(claimCount), error: null }
      }
      if (name === 'complete_media_job') {
        events.push('complete')
        return { data: null, error: null }
      }
      return { data: null, error: null }
    })

    await expect(
      drainMediaOutboxBounded(env(), 'test-worker', 100),
    ).resolves.toBe(4)

    expect(claimCount).toBe(4)
    expect(processJob).toHaveBeenCalledTimes(4)
    expect(events).toEqual([
      'process', 'complete',
      'process', 'complete',
      'process', 'complete',
      'process', 'complete',
    ])
  })

  it('continues full scheduled media and deletion batches through fresh queue invocations', async () => {
    let claimCount = 0
    rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_media_job') {
        claimCount += 1
        return { data: job(claimCount), error: null }
      }
      return { data: null, error: null }
    })
    deletionDrain.mockResolvedValue(4)

    await mediaRuntime.scheduled({}, env())

    expect(queueSend).toHaveBeenCalledWith({ kind: 'drain-media' })
    expect(queueSend).toHaveBeenCalledWith({ kind: 'drain-deletions' })
    expect(deletionDrain).toHaveBeenCalledWith(expect.anything(), 'media-deletion-worker', 4)
    expect(pruneDeletion).toHaveBeenCalledOnce()
  })

  it('delegates ordinary image wakeups to the existing queue handler', async () => {
    const message = {
      body: { imageId },
      ack: vi.fn(),
      retry: vi.fn(),
    }

    await mediaRuntime.queue({ messages: [message] }, env())

    expect(baseQueue).toHaveBeenCalledWith({ messages: [message] }, expect.anything())
    expect(queueSend).not.toHaveBeenCalled()
  })
})
