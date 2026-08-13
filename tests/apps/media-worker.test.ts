import { describe, expect, it, vi } from 'vitest'

const { deletionRpc, publicFrom, workerFrom, workerRpc } = vi.hoisted(() => ({
  deletionRpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: null; error: null }>>(async () => ({ data: null, error: null })),
  publicFrom: vi.fn(),
  workerFrom: vi.fn(),
  workerRpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>>(),
}))

vi.mock('@/apps/media-worker/src/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: workerFrom,
    rpc: (name: string, args: Record<string, unknown>) => name.includes('deletion')
      ? deletionRpc(name, args)
      : workerRpc(name, args),
  }),
  createSupabasePublicClient: () => ({ from: publicFrom }),
}))

import { processMediaDeletionJob } from '@/apps/media-worker/src/deletion-outbox'
import { buildImageTransformRequest, buildTransformedMediaHeaders, fetchCanonicalDelivery, getReadyDeliveryObjectKey, processJob } from '@/apps/media-worker/src/index'
import mediaWorker from '@/apps/media-worker/src/index'
import type { MediaDeletionJobRow } from '@/apps/media-worker/src/schema'

const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const BUCKET = 'private-media'
const SOURCE_KEY = `images/staging/${IMAGE_ID}/source.jpg`
const MEDIA_JOB_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_TOKEN = '55555555-5555-4555-8555-555555555555'

describe('media transformation requests', () => {
  it('verifies canonical delivery internally without recursively fetching the media host', async () => {
    const canonicalKey = `images/assets/${IMAGE_ID}/canonical.webp`
    const maybeSingle = vi.fn(async () => ({
      data: {
        optimized_key: canonicalKey,
        original_key: SOURCE_KEY,
        processing_status: 'ready',
        visibility: 'public',
        status: 'approved',
        moderation_status: 'skipped',
      },
      error: null,
    }))
    publicFrom.mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })
    const runtimeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'image/webp' },
    }))
    const env = {
      INTERNAL_ORIGIN_SECRET: 'secret',
      R2_ORIGIN_URL: 'https://private-origin.example',
      ORIGINALS_BUCKET: { get: vi.fn() },
    } as never

    await expect(fetchCanonicalDelivery(
      new URL(`https://media.example/${canonicalKey}?variant=detail&format=webp`),
      env,
    )).resolves.toHaveProperty('status', 200)
    expect(runtimeFetch).toHaveBeenCalledWith(
      `https://private-origin.example/${canonicalKey}`,
      expect.objectContaining({ headers: { 'X-Internal-Secret': 'secret' } }),
    )
    runtimeFetch.mockRestore()
  })

  it('uses a stable authenticated request shape', () => {
    const first = buildImageTransformRequest('https://origin.example/image.webp', 'secret', 640, 'auto')
    const second = buildImageTransformRequest('https://origin.example/image.webp', 'secret', 640, 'auto')

    expect(first).toEqual(second)
    expect(first.init).toEqual({
      headers: { 'X-Internal-Secret': 'secret' },
      cf: { image: { width: 640, format: 'auto', fit: 'scale-down', metadata: 'none' } },
    })

    expect(Object.fromEntries(buildTransformedMediaHeaders({ 'Content-Type': 'image/avif' }))).toEqual({
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'image/avif',
      vary: 'Accept',
    })
  })
})

describe('media worker fetch routing', () => {
  it('uses the public client for versioned delivery eligibility reads', async () => {
    const single = vi.fn(async () => ({
      data: {
        optimized_key: `images/assets/${IMAGE_ID}/canonical.webp`,
        original_key: SOURCE_KEY,
        asset_version: 1,
        processing_status: 'ready',
        visibility: 'public',
        status: 'approved',
        moderation_status: 'approved',
      },
      error: null,
    }))
    publicFrom.mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'image/webp' },
    }))

    const response = await mediaWorker.fetch(
      new Request(`https://media.example/images/${IMAGE_ID}/v1/detail.webp`),
      { R2_ORIGIN_URL: 'https://private-origin.example', INTERNAL_ORIGIN_SECRET: 'secret' } as never,
    )

    expect(response.status).toBe(200)
    expect(publicFrom).toHaveBeenCalledWith('images')
    expect(workerFrom).not.toHaveBeenCalled()
  })

  it('rejects private query-style object keys before fetching the origin', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        optimized_key: null,
        original_key: SOURCE_KEY,
        processing_status: 'ready',
        visibility: 'private',
        status: 'pending',
        moderation_status: null,
      },
      error: null,
    }))
    publicFrom.mockReturnValue({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })
    const originFetch = vi.spyOn(globalThis, 'fetch')
    const originals = { get: vi.fn(), head: vi.fn() }

    const response = await mediaWorker.fetch(
      new Request(`https://media.example/${SOURCE_KEY}?variant=card&format=auto`),
      {
        R2_ORIGIN_URL: 'https://private-origin.example',
        INTERNAL_ORIGIN_SECRET: 'secret',
        ORIGINALS_BUCKET: originals,
      } as never
    )

    expect(response.status).toBe(404)
    expect(publicFrom).toHaveBeenCalledWith('images')
    expect(workerFrom).not.toHaveBeenCalled()
    expect(originFetch).not.toHaveBeenCalled()
    expect(originals.get).not.toHaveBeenCalled()
    originFetch.mockRestore()
  })

  it('returns 404 for unknown paths without touching media origins or R2', async () => {
    const originFetch = vi.spyOn(globalThis, 'fetch')
    const originals = {
      get: vi.fn(),
      head: vi.fn(),
    }

    const response = await mediaWorker.fetch(new Request('https://media.example/packed.php'), {
      R2_ORIGIN_URL: 'https://private-origin.example',
      INTERNAL_ORIGIN_SECRET: 'secret',
      ORIGINALS_BUCKET: originals,
    } as never)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
    expect(originFetch).not.toHaveBeenCalled()
    expect(originals.get).not.toHaveBeenCalled()
    expect(originals.head).not.toHaveBeenCalled()
    originFetch.mockRestore()
  })
})

function createProcessingHarness(options: { failCommitOnce?: boolean; deliveryResponse?: () => Response; transformError?: Error } = {}) {
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
  const output = vi.fn(async () => {
    if (options.transformError) throw options.transformError
    return {
      response: () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'image/webp' } }),
    }
  })
  const transform = vi.fn(() => {
    events.push('resize')
    return { output }
  })
  const images = { input: vi.fn(() => ({ transform })) }
  const fetchDelivery = vi.fn(async (input: URL, deliveryEnv: Parameters<typeof fetchCanonicalDelivery>[1]) => {
    void input
    void deliveryEnv
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
    fetchDelivery: fetchDelivery,
  }

  return { bucket, dependencies, env, events, fetchDelivery, image, images, job, output, stored, supabase, transform }
}

describe('media worker canonical WebP processing', () => {
  it('claims a targeted durable job and ignores the wake-up payload as authoritative data', async () => {
    const harness = createProcessingHarness()
    Object.assign(harness.image, {
      processing_status: 'ready',
      optimized_bucket: BUCKET,
      optimized_key: 'images/assets/canonical.webp',
      optimized_mime: 'image/webp',
      optimized_bytes: 4,
      optimized_width: 2560,
      optimized_height: 1920,
      variants: { detail: { webp: { path: '/stored-delivery' } } },
      url: '/images/assets/canonical.webp?variant=detail&format=webp',
      original_deleted_at: new Date().toISOString(),
    })
    const claimedJob = {
      id: MEDIA_JOB_ID,
      image_id: IMAGE_ID,
      job_type: 'ingest_image' as const,
      status: 'processing' as const,
      payload: harness.job,
      attempts: 1,
      max_attempts: 8,
      run_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      locked_by: 'media-worker-queue',
      claim_token: CLAIM_TOKEN,
      lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    workerFrom.mockImplementation(harness.supabase.from)
    workerRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_media_job_for_image') return { data: claimedJob, error: null }
      return harness.supabase.rpc(name, args)
    })
    const message = { body: { imageId: IMAGE_ID }, ack: vi.fn(), retry: vi.fn() }

    await mediaWorker.queue({ messages: [message] }, harness.env as never)

    expect(workerRpc).toHaveBeenCalledWith('claim_media_job_for_image', {
      worker_name: 'media-worker-queue',
      p_image_id: IMAGE_ID,
      lease_seconds: 300,
    })
    expect(workerRpc).toHaveBeenCalledWith('complete_media_job', {
      p_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
    })
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('marks quota-exhausted transformations failed instead of requeueing them', async () => {
    const harness = createProcessingHarness({ transformError: new Error('IMAGES_TRANSFORM_ERROR 9422: Free unique transformations by account has been exhausted') })
    const claimedJob = {
      id: MEDIA_JOB_ID,
      image_id: IMAGE_ID,
      job_type: 'ingest_image' as const,
      status: 'processing' as const,
      payload: harness.job,
      attempts: 4,
      max_attempts: 5,
      run_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      locked_by: 'media-worker-queue',
      claim_token: CLAIM_TOKEN,
      lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    workerFrom.mockImplementation(harness.supabase.from)
    workerRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_media_job_for_image') return { data: claimedJob, error: null }
      return harness.supabase.rpc(name, args)
    })
    const message = { body: { imageId: IMAGE_ID }, ack: vi.fn(), retry: vi.fn() }

    await mediaWorker.queue({ messages: [message] }, harness.env as never)

    expect(workerRpc).toHaveBeenCalledWith('fail_media_job', {
      p_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
      p_error: 'IMAGES_TRANSFORM_ERROR 9422: Free unique transformations by account has been exhausted',
    })
    expect(workerRpc).not.toHaveBeenCalledWith('retry_media_job', expect.any(Object))
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('puts and verifies canonical bytes before commit without deleting the source', async () => {
    const harness = createProcessingHarness()

    await processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })

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
      p_media_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
    }))
    expect(harness.images.input).toHaveBeenCalledOnce()
    expect(harness.transform).toHaveBeenCalledWith({ width: 2560, fit: 'scale-down' })
    expect(harness.output).toHaveBeenCalledWith({ format: 'image/webp', quality: 82 })
    const deliveryUrl = harness.fetchDelivery.mock.calls[0]?.[0]
    expect(String(deliveryUrl)).toBe(`https://media.example/${putEvent?.replace('put:', '')}?variant=detail&format=webp`)
    expect(harness.fetchDelivery).toHaveBeenCalledWith(expect.any(URL), harness.env)
    expect(harness.supabase.rpc).toHaveBeenCalledWith('verify_media_replacement_delivery', {
      p_job_id: '33333333-3333-4333-8333-333333333333',
      p_expected_optimized_key: putEvent?.replace('put:', ''),
      p_media_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
    })
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('does not delete before a successful commit and overwrites the same orphan on retry', async () => {
    const harness = createProcessingHarness({ failCommitOnce: true })

    await expect(processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })).rejects.toThrow('commit unavailable')
    expect(harness.bucket.delete).not.toHaveBeenCalled()

    await processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })

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
      { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN },
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

    await processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })

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
      p_media_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
    }))
    expect(String(harness.fetchDelivery.mock.calls[0]?.[0])).toBe(`https://media.example${url}`)
    expect(harness.supabase.rpc).toHaveBeenCalledWith('verify_media_replacement_delivery', {
      p_job_id: '33333333-3333-4333-8333-333333333333',
      p_expected_optimized_key: optimizedKey,
      p_media_job_id: MEDIA_JOB_ID,
      p_claim_token: CLAIM_TOKEN,
    })
  })

  it('backfills a legacy ready image that has no canonical locator', async () => {
    const harness = createProcessingHarness()
    harness.image.processing_status = 'ready'
    harness.image.visibility = 'public'
    harness.image.status = 'approved'

    await processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })

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

    await expect(processJob(harness.job, harness.env as never, harness.dependencies, { jobId: MEDIA_JOB_ID, claimToken: CLAIM_TOKEN })).rejects.toThrow(error)

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
