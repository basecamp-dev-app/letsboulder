import { describe, expect, it, vi } from 'vitest'

import mediaWorker, { getReadyDeliveryObjectKey, markMediaJobsCompletedByImage, processJob } from '@/apps/media-worker/src/index'

const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const BUCKET = 'private-media'
const SOURCE_KEY = `images/staging/${IMAGE_ID}/source.jpg`

function createProcessingHarness(options: { failCommitOnce?: boolean; failDelete?: boolean } = {}) {
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
  }
  const maybeSingle = vi.fn(async () => ({ data: image, error: null }))
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    })),
    rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      events.push(`rpc:${String(args.p_optimized_key)}`)
      commitAttempts += 1
      if (options.failCommitOnce && commitAttempts === 1) {
        return { data: null, error: new Error('commit unavailable') }
      }
      return { data: '33333333-3333-4333-8333-333333333333', error: null }
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
      if (options.failDelete) throw new Error('R2 unavailable')
    }),
    get: vi.fn(),
  }
  const mediaFetch = vi.fn(async () => {
    events.push('resize')
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'image/webp' } })
  })
  const env = {
    MEDIA_HOST: 'https://static.example',
    R2_PRIVATE_BUCKET: BUCKET,
    R2_ORIGIN_URL: 'https://private-origin.example',
    INTERNAL_ORIGIN_SECRET: 'origin-secret',
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

  return { bucket, env, events, image, job, mediaFetch, stored, supabase }
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
  it('puts and verifies canonical bytes before commit, then attempts source deletion', async () => {
    const harness = createProcessingHarness({ failDelete: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await processJob(harness.job, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })

    const putEvent = harness.events.find(event => event.startsWith('put:'))
    const rpcEvent = harness.events.find(event => event.startsWith('rpc:'))
    expect(putEvent).toMatch(new RegExp(`^put:images/assets/${IMAGE_ID}/[0-9a-f]{64}/canonical\\.webp$`))
    expect(harness.events).toEqual([
      `head:${SOURCE_KEY}`,
      'resize',
      putEvent,
      putEvent?.replace('put:', 'head:'),
      rpcEvent,
      `delete:${SOURCE_KEY}`,
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
    expect(harness.mediaFetch).toHaveBeenCalledWith(
      `https://static.example/origin/${SOURCE_KEY}?transform=canonical-webp`,
      { headers: { 'X-Internal-Secret': 'origin-secret' } },
    )
    expect(warn).toHaveBeenCalledWith(
      'Immediate original deletion failed; durable deletion remains queued',
      expect.objectContaining({ imageId: IMAGE_ID }),
    )
    warn.mockRestore()
  })

  it('does not delete before a successful commit and overwrites the same orphan on retry', async () => {
    const harness = createProcessingHarness({ failCommitOnce: true })

    await expect(processJob(harness.job, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })).rejects.toThrow('commit unavailable')
    expect(harness.bucket.delete).not.toHaveBeenCalled()

    await processJob(harness.job, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })

    const putKeys = harness.bucket.put.mock.calls.map(([key]) => key)
    expect(putKeys).toHaveLength(2)
    expect(putKeys[0]).toBe(putKeys[1])
    expect(harness.bucket.delete).toHaveBeenCalledOnce()
  })

  it('rejects stale payload coordinates before reading or transforming the source', async () => {
    const harness = createProcessingHarness()

    await expect(processJob({ ...harness.job, originalKey: 'images/staging/stale.jpg' }, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })).rejects.toThrow('does not match')

    expect(harness.bucket.head).not.toHaveBeenCalled()
    expect(harness.mediaFetch).not.toHaveBeenCalled()
    expect(harness.supabase.rpc).not.toHaveBeenCalled()
  })

  it('treats a fully committed ready image as an idempotent retry', async () => {
    const harness = createProcessingHarness()
    Object.assign(harness.image, {
      processing_status: 'ready',
      optimized_bucket: BUCKET,
      optimized_key: `images/assets/${IMAGE_ID}/hash/canonical.webp`,
      optimized_mime: 'image/webp',
      optimized_bytes: 4,
      optimized_width: 2560,
      optimized_height: 1920,
    })

    await processJob(harness.job, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })

    expect(harness.bucket.head).not.toHaveBeenCalled()
    expect(harness.bucket.put).not.toHaveBeenCalled()
    expect(harness.bucket.delete).not.toHaveBeenCalled()
    expect(harness.supabase.rpc).not.toHaveBeenCalled()
  })

  it('backfills a legacy ready image that has no canonical locator', async () => {
    const harness = createProcessingHarness()
    harness.image.processing_status = 'ready'
    harness.image.visibility = 'public'
    harness.image.status = 'approved'

    await processJob(harness.job, harness.env as never, {
      createClient: () => harness.supabase as never,
      fetch: harness.mediaFetch,
    })

    expect(harness.bucket.put).toHaveBeenCalledOnce()
    expect(harness.supabase.rpc).toHaveBeenCalledWith('commit_media_webp', expect.any(Object))
    expect(harness.bucket.delete).toHaveBeenCalledWith(SOURCE_KEY)
  })

  it('uses only the canonical locator for ready public delivery', () => {
    const optimizedKey = `images/assets/${IMAGE_ID}/hash/canonical.webp`
    const originalKey = `images/assets/${IMAGE_ID}/original/original.jpg`
    expect(getReadyDeliveryObjectKey({ processing_status: 'ready', optimized_key: optimizedKey, original_key: originalKey })).toBe(optimizedKey)
    expect(getReadyDeliveryObjectKey({ processing_status: 'processing', optimized_key: optimizedKey, original_key: originalKey })).toBeNull()
    expect(getReadyDeliveryObjectKey({ processing_status: 'ready', optimized_key: null, original_key: originalKey })).toBe(originalKey)
  })

  it('performs canonical resizing inside an authenticated fetch event', async () => {
    const transformed = new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } })
    const resizeFetch = vi.fn(async () => transformed)
    vi.stubGlobal('fetch', resizeFetch)

    const response = await mediaWorker.fetch(new Request(
      `https://static.example/origin/${SOURCE_KEY}?transform=canonical-webp`,
      { headers: { 'X-Internal-Secret': 'origin-secret' } },
    ), {
      INTERNAL_ORIGIN_SECRET: 'origin-secret',
      R2_ORIGIN_URL: 'https://private-origin.example',
    } as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(resizeFetch).toHaveBeenCalledWith(
      `https://private-origin.example/${SOURCE_KEY}`,
      expect.objectContaining({
        cf: { image: { width: 2560, quality: 82, format: 'webp', fit: 'scale-down', metadata: 'none' } },
      }),
    )
    vi.unstubAllGlobals()
  })
})
