import { describe, expect, it, vi } from 'vitest'

const { deletionRpc } = vi.hoisted(() => ({
  deletionRpc: vi.fn(async () => ({ data: null, error: null })),
}))

vi.mock('@/apps/media-worker/src/supabase', () => ({
  createSupabaseAdminClient: () => ({ rpc: deletionRpc }),
}))

import { processMediaDeletionJob } from '@/apps/media-worker/src/deletion-outbox'
import { getReadyDeliveryObjectKey, markMediaJobsCompletedByImage, processJob } from '@/apps/media-worker/src/index'
import type { MediaDeletionJobRow } from '@/apps/media-worker/src/schema'

const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const BUCKET = 'private-media'
const SOURCE_KEY = `images/staging/${IMAGE_ID}/source.jpg`

function createProcessingHarness(options: { failCommitOnce?: boolean; deliveryResponse?: () => Response } = {}) {
  const events: string[] = []
  const stored = new Map<string, { size: number; contentType: string }>()
  let commitAttempts = 0
  const image = {
    id: IMAGE_ID,
    created_by: USER_ID,
    storage_provider: 'r2',
    original_bucket: BUCKET,
    original_key: SOURCE_KEY,
    original_width: 4000,
    original_height: 3000,
    original_mime_type: 'image/jpeg',
    original_bytes: 123,
    width: 4000,
    height: 3000,
    visibility: 'private',
    processing_status: 'queued',
    status: 'pending',
    optimized_bucket: null,
    optimized_key: null,
    optimized_mime: null,
    optimized_bytes: null,
    optimized_width: null,
    optimized_height: null,
    original_deleted_at: null,
    variants: null,
    url: null,
  }
  const maybeSingle = vi.fn(async () => ({ data: image, error: null }))
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'commit_media_webp') {
        events.push(`rpc:${String(args.p_optimized_key)}`)
        commitAttempts += 1
        if (options.failCommitOnce && commitAttempts === 1) {
          return { data: null, error: new Error('commit unavailable') }
        }
        return { data: '33333333-3333-4333-8333-333333333333', error: null }
      }
      events.push(`verify:${String(args.p_expected_optimized_key)}`)
      return { data: null, error: null }
    }),
  }
  const bucket = {
    head: vi.fn(async (key: string) => {
      events.push(`head:${key}`)
      if (key === SOURCE_KEY) return { size: 123, httpMetadata: { contentType: 'image/jpeg' } }
      const object = stored.get(key)
      return object ? { size: object.size, httpMetadata: { contentType: object.contentType } } : null
    }),
    put: vi.fn(async (key: string, value: ArrayBuffer, putOptions: { httpMetadata: { contentType: string } }) => {
      events.push(`put:${key}`)
      stored.set(key, { size: value.byteLength, contentType: putOptions.httpMetadata.contentType })
      return { size: value.byteLength }
    }),
    delete: vi.fn(async (key: string) => {
      events.push(`delete:${key}`)
    }),
    get: vi.fn(async (key: string) => key === SOURCE_KEY ? { body: new ReadableStream() } : null),
  }
  const output = vi.fn(async () => ({
    response: () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'image/webp' } }),
  }))
  const transform = vi.fn(() => {
    events.push('resize')
    return { output }
  })
  const images = { input: vi.fn(() => ({ transform })) }
  const fetchDelivery = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    events.push('fetch')
    return options.deliveryResponse?.() ?? new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    })
  })
  const env = {
    MEDIA_HOST: 'https://media.example',
    R2_PRIVATE_BUCKET: BUCKET,
    R2_ORIGIN_URL: 'https://private-origin.example',
    IMAGES: images,
    ORIGINALS_BUCKET: bucket,
  }
  const job = {
    imageId: IMAGE_ID,
    originalBucket: BUCKET,
    originalKey: SOURCE_KEY,
    storageProvider: 'r2' as const,
    purpose: 'submission_image' as const,
    triggeredByUserId: USER_ID,
  }
  const dependencies = {
    createClient: () => supabase as never,
    fetch: fetchDelivery,
  }

  return { bucket, dependencies, env, events, fetchDelivery, image, images, job, output, stored, supabase, transform }
}

describe('media worker durable job synchronization', () => {
  it('completes active durable jobs after queue processing', async () => {
    const inStatuses = vi.fn(async () => ({ error: null }))
    const eqImage = vi.fn(() => ({ in: inStatuses }))
    const update = vi.fn(() => ({ eq: eqImage }))
    const supabase = {
      from: vi.fn(() => ({ update })),
    }

    await markMediaJobsCompletedByImage(supabase as never, 'image-1')

    expect(supabase.from).toHaveBeenCalledWith('media_jobs')
    expect(eqImage).toHaveBeenCalledWith('image_id', 'image-1')
    expect(inStatuses).toHaveBeenCalledWith('status', ['queued', 'processing'])
    expect(update).toHaveBeenCalledWith({
      status: 'completed',
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
  })

  it('surfaces synchronization failures so the queue message retries', async () => {
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ error: new Error('database unavailable') })),
          })),
        })),
      })),
    }

    await expect(markMediaJobsCompletedByImage(supabase as never, 'image-1'))
      .rejects.toThrow('database unavailable')
  })
})

describe('media worker canonical WebP processing', () => {
  it('puts and verifies canonical bytes before commit without deleting the source', async () => {
    const harness = createProcessingHarness()

    await processJob(harness.job, harness.env as never, harness.dependencies)

    const putEvent = harness.events.find(event => event.startsWith('put:'))
    const rpcEvent = harness.events.find(event => event.startsWith('rpc:'))
    expect(putEvent).toMatch(new RegExp(`^put:images/assets/${IMAGE_ID}/[0-9a-f]{64}/canonical\\.webp$`))
    expect(harness.events).toEqual([
      `head:${SOURCE_KEY}`,
      'resize',
      putEvent,
      putEvent?.replace('put:', 'head:'),
      rpcEvent,
      'fetch',
      `verify:${putEvent?.replace('put:', '')}`,
    ])
    expect(rpcEvent?.replace('rpc:', '')).toBe(putEvent?.replace('put:', ''))
    expect(harness.supabase.rpc).toHaveBeenCalledWith('commit_media_webp', expect.objectContaining({
      p_expected_original_bucket: BUCKET,
      p_expected_original_key: SOURCE_KEY,
      p_optimized_bucket: BUCKET,
      p_optimized_mime: 'image/webp',
      p_optimized_bytes: 4,
      p_optimized_width: 2560,
      p_optimized_height: 1920,
      p_manifest: expect.objectContaining({
        detail: expect.objectContaining({
          webp: expect.objectContaining({ path: expect.stringContaining('/canonical.webp?variant=detail&format=webp') }),
        }),
      }),
      p_url: expect.stringContaining('/canonical.webp?variant=detail&format=webp'),
    }))
    expect(harness.images.input).toHaveBeenCalledOnce()
    expect(harness.transform).toHaveBeenCalledWith({ width: 2560, fit: 'scale-down' })
    expect(harness.output).toHaveBeenCalledWith({ format: 'image/webp', quality: 82 })
    const deliveryUrl = harness.fetchDelivery.mock.calls[0]?.[0]
    expect(String(deliveryUrl)).toBe(`https://media.example/${putEvent?.replace('put:', '')}?variant=detail&format=webp`)
    expect(harness.fetchDelivery).toHaveBeenCalledWith(expect.any(URL), { method: 'GET' })
    expect(harness.supabase.rpc).toHaveBeenCalledWith('verify_media_replacement_delivery', {
      p_job_id: '33333333-3333-4333-8333-333333333333',
      p_expected_optimized_key: putEvent?.replace('put:', ''),
    })
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('does not delete before a successful commit and overwrites the same orphan on retry', async () => {
    const harness = createProcessingHarness({ failCommitOnce: true })

    await expect(processJob(harness.job, harness.env as never, harness.dependencies)).rejects.toThrow('commit unavailable')
    expect(harness.bucket.delete).not.toHaveBeenCalled()

    await processJob(harness.job, harness.env as never, harness.dependencies)

    const putKeys = harness.bucket.put.mock.calls.map(([key]) => key)
    expect(putKeys).toHaveLength(2)
    expect(putKeys[0]).toBe(putKeys[1])
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('rejects stale payload coordinates before reading or transforming the source', async () => {
    const harness = createProcessingHarness()

    await expect(processJob(
      { ...harness.job, originalKey: 'images/staging/stale.jpg' },
      harness.env as never,
      harness.dependencies,
    )).rejects.toThrow('does not match')

    expect(harness.bucket.head).not.toHaveBeenCalled()
    expect(harness.images.input).not.toHaveBeenCalled()
    expect(harness.supabase.rpc).not.toHaveBeenCalled()
  })

  it('replays a committed image and verifies its stored canonical delivery', async () => {
    const harness = createProcessingHarness()
    const optimizedKey = `images/assets/${IMAGE_ID}/${'a'.repeat(64)}/canonical.webp`
    const variants = { detail: { webp: { path: '/stored-delivery' } } }
    const url = `${optimizedKey.startsWith('/') ? '' : '/'}${optimizedKey}?variant=detail&format=webp`
    Object.assign(harness.image, {
      processing_status: 'ready',
      optimized_bucket: BUCKET,
      optimized_key: optimizedKey,
      optimized_mime: 'image/webp',
      optimized_bytes: 4,
      optimized_width: 2560,
      optimized_height: 1920,
      variants,
      url,
    })

    await processJob(harness.job, harness.env as never, harness.dependencies)

    expect(harness.bucket.head).not.toHaveBeenCalled()
    expect(harness.bucket.put).not.toHaveBeenCalled()
    expect(harness.bucket.delete).not.toHaveBeenCalled()
    expect(harness.supabase.rpc).toHaveBeenCalledWith('commit_media_webp', expect.objectContaining({
      p_optimized_key: optimizedKey,
      p_optimized_bytes: 4,
      p_optimized_width: 2560,
      p_optimized_height: 1920,
      p_manifest: variants,
      p_url: url,
    }))
    expect(String(harness.fetchDelivery.mock.calls[0]?.[0])).toBe(`https://media.example${url}`)
    expect(harness.supabase.rpc).toHaveBeenCalledWith('verify_media_replacement_delivery', {
      p_job_id: '33333333-3333-4333-8333-333333333333',
      p_expected_optimized_key: optimizedKey,
    })
  })

  it('backfills a legacy ready image that has no canonical locator', async () => {
    const harness = createProcessingHarness()
    harness.image.processing_status = 'ready'
    harness.image.visibility = 'public'
    harness.image.status = 'approved'

    await processJob(harness.job, harness.env as never, harness.dependencies)

    expect(harness.bucket.put).toHaveBeenCalledOnce()
    expect(harness.supabase.rpc).toHaveBeenCalledWith('commit_media_webp', expect.any(Object))
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('uses only the canonical locator for ready public delivery', () => {
    const optimizedKey = `images/assets/${IMAGE_ID}/hash/canonical.webp`
    const originalKey = `images/assets/${IMAGE_ID}/original/original.jpg`
    expect(getReadyDeliveryObjectKey({ processing_status: 'ready', optimized_key: optimizedKey, original_key: originalKey })).toBe(optimizedKey)
    expect(getReadyDeliveryObjectKey({ processing_status: 'processing', optimized_key: optimizedKey, original_key: originalKey })).toBeNull()
    expect(getReadyDeliveryObjectKey({ processing_status: 'ready', optimized_key: null, original_key: originalKey })).toBe(originalKey)
  })

  it.each([
    {
      name: '404 response',
      response: () => new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
      error: 'status 404',
    },
    {
      name: 'non-image response',
      response: () => new Response('html', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      error: 'did not return an image',
    },
    {
      name: 'empty response',
      response: () => new Response(new Uint8Array(), { status: 200, headers: { 'Content-Type': 'image/webp' } }),
      error: 'empty body',
    },
  ])('retries without verifying or deleting after a public $name', async ({ response, error }) => {
    const harness = createProcessingHarness({ deliveryResponse: response })

    await expect(processJob(harness.job, harness.env as never, harness.dependencies)).rejects.toThrow(error)

    expect(harness.supabase.rpc).not.toHaveBeenCalledWith('verify_media_replacement_delivery', expect.any(Object))
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

})

describe('media worker deletion validation', () => {
  it('fails an unverified source replacement without deleting its source', async () => {
    deletionRpc.mockClear()
    const deleteObject = vi.fn(async () => undefined)
    const job: MediaDeletionJobRow = {
      id: '33333333-3333-4333-8333-333333333333',
      bucket: BUCKET,
      object_key: SOURCE_KEY,
      reason: 'source_replaced',
      source_type: 'image',
      source_id: IMAGE_ID,
      image_id: IMAGE_ID,
      delivery_verified_at: null,
      expected_object_etag: null,
      expected_object_bytes: null,
      reconciliation_run_id: null,
      reconciliation_artifact_digest: null,
      status: 'processing',
      attempts: 1,
      max_attempts: 8,
      claim_token: '44444444-4444-4444-8444-444444444444',
    }

    await processMediaDeletionJob(job, {
      R2_PRIVATE_BUCKET: BUCKET,
      ORIGINALS_BUCKET: { delete: deleteObject },
    } as never)

    expect(deleteObject).not.toHaveBeenCalled()
    expect(deletionRpc).toHaveBeenCalledWith('fail_media_deletion_job', {
      p_job_id: job.id,
      p_claim_token: job.claim_token,
      p_error: 'Source replacement deletion is not delivery-verified',
    })
  })

  it('allows a canonical optimized key namespaced to its image', async () => {
    deletionRpc.mockClear()
    const deleteObject = vi.fn(async () => undefined)
    const objectKey = `images/assets/${IMAGE_ID}/hash/canonical.webp`
    const job: MediaDeletionJobRow = {
      id: '33333333-3333-4333-8333-333333333333',
      bucket: BUCKET,
      object_key: objectKey,
      reason: 'image_hard_deleted',
      source_type: 'image',
      source_id: IMAGE_ID,
      image_id: IMAGE_ID,
      delivery_verified_at: null,
      expected_object_etag: null,
      expected_object_bytes: null,
      reconciliation_run_id: null,
      reconciliation_artifact_digest: null,
      status: 'processing',
      attempts: 1,
      max_attempts: 8,
      claim_token: '44444444-4444-4444-8444-444444444444',
    }

    await processMediaDeletionJob(job, {
      R2_PRIVATE_BUCKET: BUCKET,
      ORIGINALS_BUCKET: { delete: deleteObject },
    } as never)

    expect(deleteObject).toHaveBeenCalledWith(objectKey)
    expect(deletionRpc).toHaveBeenCalledWith('complete_media_deletion_job', {
      p_job_id: job.id,
      p_claim_token: job.claim_token,
    })
  })
})
