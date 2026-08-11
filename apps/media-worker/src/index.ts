import { createSupabaseAdminClient, type Env, type MessageBatch } from './supabase'
import { MEDIA_FORMATS, MEDIA_VARIANT_WIDTHS, getVariantWidth, type MediaFormatKey, type MediaVariantKey } from './config'
import { mediaIngestJobSchema, mediaWakeupSchema, type MediaIngestJobPayload, type MediaJobRow } from './schema'
import { drainMediaDeletionOutbox, pruneMediaDeletionOutbox } from './deletion-outbox'

const OUTBOX_WORKER_NAME = 'media-worker-scheduled'
const OUTBOX_DRAIN_LIMIT = 10
const MEDIA_JOB_LEASE_SECONDS = 300

// Keep this worker contract narrow and local; the worker is an independent package and does not import app types.
interface ImageRow {
  id: string
  created_by: string | null
  storage_provider: string | null
  original_bucket: string | null
  original_key: string | null
  original_width: number | null
  original_height: number | null
  original_mime_type: string | null
  original_bytes: number | null
  width: number | null
  height: number | null
  visibility: string | null
  processing_status: string | null
  status: string | null
  optimized_bucket: string | null
  optimized_key: string | null
  optimized_mime: string | null
  optimized_bytes: number | null
  optimized_width: number | null
  optimized_height: number | null
  original_deleted_at: string | null
  variants: unknown
  url: string | null
}

interface ProcessJobDependencies {
  createClient(env: Env): ReturnType<typeof createSupabaseAdminClient>
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export function fetchMediaDelivery(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init)
}

export interface MediaJobClaimContext {
  jobId: string
  claimToken: string
}

const defaultProcessJobDependencies: ProcessJobDependencies = {
  createClient: createSupabaseAdminClient,
  fetch: fetchMediaDelivery,
}

const CANONICAL_WIDTH = 2560
const CANONICAL_QUALITY = 82
const CANONICAL_MIME = 'image/webp'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unknown media job error'
}

function isCloudflareTransformQuotaError(error: unknown): boolean {
  return stringifyError(error).includes('IMAGES_TRANSFORM_ERROR 9422')
}

function buildMediaPath(originalKey: string, variant: MediaVariantKey, format: MediaFormatKey): string {
  const originPath = `/${originalKey.split('/').map(encodeURIComponent).join('/')}`
  return `${originPath}?variant=${variant}&format=${format}`
}

export function buildImageTransformRequest(
  originUrl: string,
  internalOriginSecret: string,
  width: number,
  format: 'avif' | 'auto' | 'jpeg' | 'webp',
): { input: string; init: RequestInit } {
  return {
    input: originUrl,
    init: {
      headers: { 'X-Internal-Secret': internalOriginSecret },
      cf: {
        image: { width, format, fit: 'scale-down', metadata: 'none' },
      },
    } as RequestInit,
  }
}

export function buildTransformedMediaHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Vary', 'Accept')
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

export function getReadyDeliveryObjectKey(
  image: Pick<ImageRow, 'optimized_key' | 'original_key' | 'processing_status'>,
): string | null {
  return image.processing_status === 'ready' ? image.optimized_key || image.original_key : null
}

function buildMapHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Range')
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range')
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream')
  return headers
}

function parseRangeHeader(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return 'invalid' as const

  const [, startValue, endValue] = match
  if (!startValue && !endValue) return 'invalid' as const

  if (!startValue) {
    const suffixLength = Number(endValue)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid' as const
    const offset = Math.max(size - suffixLength, 0)
    return { offset, end: size - 1, length: size - offset }
  }

  const offset = Number(startValue)
  const end = endValue ? Number(endValue) : size - 1
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end < offset || offset >= size) {
    return 'invalid' as const
  }

  const normalizedEnd = Math.min(end, size - 1)
  return { offset, end: normalizedEnd, length: normalizedEnd - offset + 1 }
}

function deriveHeight(sourceWidth: number | null, sourceHeight: number | null, targetWidth: number): number {
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return targetWidth
  }

  if (targetWidth >= sourceWidth) {
    return sourceHeight
  }

  return Math.max(1, Math.round(sourceHeight * (targetWidth / sourceWidth)))
}

// Invariant: manifest paths are delivery recipes; ingest never writes variant objects.
function buildVirtualManifest(originalKey: string, sourceWidth: number | null, sourceHeight: number | null) {
  const manifest: Partial<Record<MediaVariantKey, Partial<Record<MediaFormatKey, { path: string; width: number; height: number; contentType: string }>>>> = {}

  for (const [variant, configuredWidth] of Object.entries(MEDIA_VARIANT_WIDTHS) as Array<[MediaVariantKey, number]>) {
    const width = sourceWidth ? Math.min(configuredWidth, sourceWidth) : configuredWidth
    const height = deriveHeight(sourceWidth, sourceHeight, width)
    manifest[variant] = {}

    for (const [format, contentType] of Object.entries(MEDIA_FORMATS) as Array<[MediaFormatKey, string]>) {
      manifest[variant]![format] = {
        path: buildMediaPath(originalKey, variant, format),
        width,
        height,
        contentType,
      }
    }
  }

  return manifest
}


async function handleEnqueue(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${env.INGRESS_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = mediaIngestJobSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: 'Invalid media ingest payload', issues: parsed.error.flatten() }, { status: 400 })
  }

  await env.MEDIA_QUEUE.send({ imageId: parsed.data.imageId })
  return json({ success: true, status: 'queued' }, { status: 202 })
}

async function loadImage(supabase: ReturnType<typeof createSupabaseAdminClient>, imageId: string) {
  const { data, error } = await supabase
    .from('images')
    .select('id, created_by, storage_provider, original_bucket, original_key, original_width, original_height, original_mime_type, original_bytes, width, height, visibility, processing_status, status, optimized_bucket, optimized_key, optimized_mime, optimized_bytes, optimized_width, optimized_height, original_deleted_at, variants, url')
    .eq('id', imageId)
    .maybeSingle()

  if (error) throw error
  return data as ImageRow | null
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function normalizedContentType(value: string | null | undefined): string | null {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || null
}

async function commitAndVerifyCanonical(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  env: Env,
  dependencies: ProcessJobDependencies,
  image: ImageRow,
  canonical: {
    optimizedKey: string
    optimizedMime: string
    optimizedBytes: number
    optimizedWidth: number
    optimizedHeight: number
    manifest: unknown
    url: string
  },
  claim: MediaJobClaimContext,
) {
  const { data: deletionJobId, error } = await supabase.rpc('commit_media_webp', {
    p_image_id: image.id,
    p_expected_original_bucket: image.original_bucket,
    p_expected_original_key: image.original_key,
    p_optimized_bucket: env.R2_PRIVATE_BUCKET,
    p_optimized_key: canonical.optimizedKey,
    p_optimized_mime: canonical.optimizedMime,
    p_optimized_bytes: canonical.optimizedBytes,
    p_optimized_width: canonical.optimizedWidth,
    p_optimized_height: canonical.optimizedHeight,
    p_manifest: canonical.manifest,
    p_url: canonical.url,
    p_media_job_id: claim.jobId,
    p_claim_token: claim.claimToken,
  })
  if (error) throw error
  if (typeof deletionJobId !== 'string' || !deletionJobId) {
    throw new Error('Canonical WebP commit did not return a deletion job')
  }

  const deliveryUrl = new URL(canonical.url, env.MEDIA_HOST)
  const delivery = await dependencies.fetch(deliveryUrl, { method: 'GET' })
  if (delivery.status !== 200) {
    throw new Error(`Canonical public delivery returned status ${delivery.status}`)
  }

  const deliveryContentType = normalizedContentType(delivery.headers.get('Content-Type'))
  if (!deliveryContentType?.startsWith('image/')) {
    throw new Error('Canonical public delivery did not return an image')
  }
  if ((await delivery.arrayBuffer()).byteLength === 0) {
    throw new Error('Canonical public delivery returned an empty body')
  }

  const { error: verificationError } = await supabase.rpc('verify_media_replacement_delivery', {
    p_job_id: deletionJobId,
    p_expected_optimized_key: canonical.optimizedKey,
    p_media_job_id: claim.jobId,
    p_claim_token: claim.claimToken,
  })
  if (verificationError) throw verificationError
}

export async function processJob(
  job: MediaIngestJobPayload,
  env: Env,
  dependencies: ProcessJobDependencies = defaultProcessJobDependencies,
  claim: MediaJobClaimContext,
) {
  const supabase = dependencies.createClient(env)
  const image = await loadImage(supabase, job.imageId)

  if (!image || image.status === 'deleted') {
    return
  }

  if (!image.original_key || !image.original_bucket || image.storage_provider !== 'r2') {
    throw new Error(`Image ${job.imageId} is missing original storage metadata`)
  }

  if (image.original_bucket !== job.originalBucket || image.original_key !== job.originalKey || job.storageProvider !== image.storage_provider) {
    throw new Error(`Media job source does not match image ${job.imageId}`)
  }

  if (image.original_bucket !== env.R2_PRIVATE_BUCKET) {
    throw new Error(`Image ${job.imageId} source bucket is not allowlisted`)
  }

  if (image.optimized_key) {
    if (image.processing_status !== 'ready' || image.optimized_bucket !== env.R2_PRIVATE_BUCKET || image.optimized_mime !== CANONICAL_MIME ||
        !image.optimized_bytes || !image.optimized_width || !image.optimized_height ||
        !image.variants || typeof image.variants !== 'object' || Array.isArray(image.variants) || !image.url) {
      throw new Error(`Ready image ${job.imageId} is missing canonical WebP metadata`)
    }
    if (image.original_deleted_at) return
    await commitAndVerifyCanonical(supabase, env, dependencies, image, {
      optimizedKey: image.optimized_key,
      optimizedMime: image.optimized_mime,
      optimizedBytes: image.optimized_bytes,
      optimizedWidth: image.optimized_width,
      optimizedHeight: image.optimized_height,
      manifest: image.variants,
      url: image.url,
    }, claim)
    return
  }

  const sourceHead = await env.ORIGINALS_BUCKET.head(image.original_key)
  if (!sourceHead) {
    throw new Error(`Original object not found for ${image.original_key}`)
  }

  const sourceWidth = image.original_width || image.width
  const sourceHeight = image.original_height || image.height
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error(`Image ${job.imageId} is missing valid source dimensions`)
  }

  const source = await env.ORIGINALS_BUCKET.get(image.original_key)
  if (!source?.body) throw new Error(`Original object body not found for ${image.original_key}`)
  const resized = (await env.IMAGES.input(source.body)
    .transform({ width: CANONICAL_WIDTH, fit: 'scale-down' })
    .output({ format: CANONICAL_MIME, quality: CANONICAL_QUALITY }))
    .response()

  if (!resized.ok) {
    throw new Error(`Canonical WebP resize failed with status ${resized.status}`)
  }
  if (normalizedContentType(resized.headers.get('Content-Type')) !== CANONICAL_MIME) {
    throw new Error('Canonical resize did not return image/webp')
  }

  const bytes = await resized.arrayBuffer()
  if (bytes.byteLength === 0) throw new Error('Canonical resize returned an empty object')

  const hash = await sha256Hex(bytes)
  const optimizedKey = `images/assets/${image.id}/${hash}/canonical.webp`
  const optimizedWidth = Math.min(CANONICAL_WIDTH, sourceWidth)
  const optimizedHeight = deriveHeight(sourceWidth, sourceHeight, optimizedWidth)
  const manifest = buildVirtualManifest(optimizedKey, optimizedWidth, optimizedHeight)
  const url = buildMediaPath(optimizedKey, 'detail', 'webp')

  await env.ORIGINALS_BUCKET.put(optimizedKey, bytes, {
    httpMetadata: {
      contentType: CANONICAL_MIME,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
  const optimizedHead = await env.ORIGINALS_BUCKET.head(optimizedKey)
  if (!optimizedHead || optimizedHead.size !== bytes.byteLength ||
      normalizedContentType(optimizedHead.httpMetadata?.contentType) !== CANONICAL_MIME) {
    throw new Error(`Canonical WebP verification failed for ${optimizedKey}`)
  }

  await commitAndVerifyCanonical(supabase, env, dependencies, image, {
    optimizedKey,
    optimizedMime: CANONICAL_MIME,
    optimizedBytes: bytes.byteLength,
    optimizedWidth,
    optimizedHeight,
    manifest,
    url,
  }, claim)
}

async function claimMediaJob(supabase: ReturnType<typeof createSupabaseAdminClient>, workerName: string, imageId?: string) {
  const { data, error } = await supabase.rpc(imageId ? 'claim_media_job_for_image' : 'claim_media_job', imageId
    ? { worker_name: workerName, p_image_id: imageId, lease_seconds: MEDIA_JOB_LEASE_SECONDS }
    : { worker_name: workerName, lease_seconds: MEDIA_JOB_LEASE_SECONDS })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('id' in data) || data.id === null) {
    console.log('Media job claim returned no due job', { workerName, imageId: imageId ?? null })
    return null
  }
  console.log('Claimed media job', {
    workerName,
    imageId: 'image_id' in data && typeof data.image_id === 'string' ? data.image_id : imageId ?? null,
    jobId: data.id,
    attempts: 'attempts' in data ? data.attempts : null,
  })
  return data as MediaJobRow | null
}

async function markMediaJobForRetry(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: MediaJobRow,
  error: unknown
) {
  const { error: retryError } = await supabase.rpc('retry_media_job', {
    p_job_id: job.id, p_claim_token: job.claim_token, p_error: stringifyError(error),
  })
  if (retryError) throw retryError
}

async function failMediaJobPermanently(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: MediaJobRow,
  error: unknown
) {
  const { error: jobError } = await supabase.rpc('fail_media_job', {
    p_job_id: job.id, p_claim_token: job.claim_token, p_error: stringifyError(error),
  })
  if (jobError) throw jobError
}

async function processClaimedMediaJob(job: MediaJobRow, env: Env) {
  const supabase = createSupabaseAdminClient(env)
  const parsed = mediaIngestJobSchema.safeParse(job.payload)

  if (!parsed.success) {
    console.error('Failing media job with invalid payload', { jobId: job.id, imageId: job.image_id })
    await failMediaJobPermanently(supabase, job, new Error('Invalid media ingest payload'))
    return
  }

  try {
    await processJob(parsed.data, env, undefined, { jobId: job.id, claimToken: job.claim_token })
    const { error } = await supabase.rpc('complete_media_job', { p_job_id: job.id, p_claim_token: job.claim_token })
    if (error) throw error
    console.log('Completed media job', { jobId: job.id, imageId: job.image_id, attempts: job.attempts })
  } catch (error) {
    const errorMessage = stringifyError(error)
    if (isCloudflareTransformQuotaError(error)) {
      console.error('Failing media job because Cloudflare Images transformation quota is exhausted', {
        jobId: job.id,
        imageId: job.image_id,
        attempts: job.attempts,
        error: errorMessage,
      })
      await failMediaJobPermanently(supabase, job, error)
      return
    }
    await markMediaJobForRetry(supabase, job, error)
    console.warn('Requeued media job after processing failure', {
      jobId: job.id,
      imageId: job.image_id,
      attempts: job.attempts,
      error: errorMessage,
    })
  }
}

async function drainMediaOutbox(env: Env, workerName = OUTBOX_WORKER_NAME, limit = OUTBOX_DRAIN_LIMIT) {
  const supabase = createSupabaseAdminClient(env)
  let processed = 0

  for (let index = 0; index < limit; index += 1) {
    const job = await claimMediaJob(supabase, workerName)
    if (!job) break
    await processClaimedMediaJob(job, env)
    processed += 1
  }

  console.log('Drained media outbox', { workerName, limit, processed })
  return processed
}

async function handleOrigin(request: Request, env: Env, url: URL) {
  const secret = request.headers.get('X-Internal-Secret')
  if (secret !== env.INTERNAL_ORIGIN_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const objectKey = url.pathname.replace(/^\/origin\//, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
    .join('/')

  if (!objectKey) {
    return new Response('Not found', { status: 404 })
  }

  const object = await env.ORIGINALS_BUCKET.get(objectKey)
  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'private, max-age=3600')

  return new Response(object.body, { headers })
}

async function handleMapAsset(request: Request, env: Env, url: URL) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildMapHeaders() })
  }

  const objectKey = url.pathname.substring(1)
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
    .join('/')

  if (!objectKey) {
    return new Response('Not found', { status: 404, headers: buildMapHeaders() })
  }

  const head = await env.PUBLIC_BUCKET.head(objectKey)
  if (!head) {
    return new Response('Not found', { status: 404, headers: buildMapHeaders() })
  }

  const range = parseRangeHeader(request.headers.get('Range'), head.size)
  if (range === 'invalid') {
    const headers = buildMapHeaders({ 'Content-Range': `bytes */${head.size}` })
    return new Response('Invalid range', { status: 416, headers })
  }

  const headers = buildMapHeaders()
  headers.set('Content-Length', String(range?.length ?? head.size))
  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.end}/${head.size}`)
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: range ? 206 : 200, headers })
  }

  const object = await env.PUBLIC_BUCKET.get(objectKey, range ? { range: { offset: range.offset, length: range.length } } : undefined)
  if (!object) {
    return new Response('Not found', { status: 404, headers: buildMapHeaders() })
  }

  object.writeHttpMetadata(headers)
  headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Range')
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range')
  headers.set('Accept-Ranges', 'bytes')

  return new Response(object.body, { status: range ? 206 : 200, headers })
}

async function handleMedia(request: Request, env: Env, url: URL) {
  const pathname = url.pathname.substring(1)

  const staticVariantMatch = pathname.match(/^images\/([^/]+)\/v([1-9][0-9]*)\/([a-z0-9_-]+)\.([a-z]+)$/i)
  let objectKey: string
  let variant: string | null = null
  let width: number | null = null

  if (staticVariantMatch) {
    const uuid = staticVariantMatch[1]
    const requestedAssetVersion = Number(staticVariantMatch[2])
    variant = staticVariantMatch[3] ?? null
    width = getVariantWidth(variant)

    const supabase = createSupabaseAdminClient(env)
    const { data: image } = await supabase
      .from('images')
      .select('optimized_key, original_key, asset_version, processing_status, visibility, status, moderation_status')
      .eq('id', uuid)
      .single()

    if (!image || image.asset_version !== requestedAssetVersion || image.processing_status !== 'ready' || image.visibility !== 'public' ||
        image.status !== 'approved' || !['approved', 'skipped'].includes(image.moderation_status ?? '')) {
      return new Response('Not found', { status: 404 })
    }

    const deliveryKey = getReadyDeliveryObjectKey(image)
    if (!deliveryKey) return new Response('Not found', { status: 404 })
    objectKey = deliveryKey
  } else {
    objectKey = pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
      .join('/')

    variant = url.searchParams.get('variant')
    width = getVariantWidth(variant)

    // Query-style paths do not contain an image ID, so verify that the exact
    // R2 key belongs to an anonymously deliverable image before transforming.
    const supabase = createSupabaseAdminClient(env)
    const { data: optimizedImage } = await supabase
      .from('images')
      .select('optimized_key, original_key, processing_status, visibility, status, moderation_status')
      .eq('optimized_key', objectKey)
      .maybeSingle()
    const { data: image } = optimizedImage
      ? { data: optimizedImage }
      : await supabase
        .from('images')
        .select('optimized_key, original_key, processing_status, visibility, status, moderation_status')
        .eq('original_key', objectKey)
        .maybeSingle()

    if (!image || image.processing_status !== 'ready' || image.visibility !== 'public' ||
        image.status !== 'approved' || !['approved', 'skipped'].includes(image.moderation_status ?? '')) {
      return new Response('Not found', { status: 404 })
    }
  }

  if (!objectKey) {
    return new Response('Not found', { status: 404 })
  }

  if (!width) {
    return new Response('Not found', { status: 404 })
  }

  const formatParam = url.searchParams.get('format')
  const format = formatParam === 'avif' || formatParam === 'jpeg' || formatParam === 'auto'
    ? formatParam
    : 'webp'
  const originUrl = `${env.R2_ORIGIN_URL}/${objectKey.split('/').map(encodeURIComponent).join('/')}`

  const transformRequest = buildImageTransformRequest(originUrl, env.INTERNAL_ORIGIN_SECRET, width, format)
  const response = await fetch(transformRequest.input, transformRequest.init)

  if (!response.ok) {
    const fallback = await env.ORIGINALS_BUCKET.get(objectKey)
    if (!fallback?.body) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    fallback.writeHttpMetadata(headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', objectKey.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg')
    }
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(fallback.body, { status: 200, headers })
  }

  const headers = buildTransformedMediaHeaders(response.headers)
  return new Response(response.body, { status: response.status, headers })
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/enqueue') {
      return handleEnqueue(request, env)
    }

    if (request.method === 'GET' && url.pathname.startsWith('/origin/')) {
      return handleOrigin(request, env, url)
    }

    if ((request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') && url.pathname.startsWith('/maps/')) {
      return handleMapAsset(request, env, url)
    }

    if (request.method === 'GET' && !url.pathname.startsWith('/origin/') && url.pathname !== '/enqueue') {
      return handleMedia(request, env, url)
    }

    return new Response('Not found', { status: 404 })
  },

  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      try {
        const parsed = mediaWakeupSchema.safeParse(message.body)
        if (!parsed.success) {
          message.ack()
          continue
        }

        const supabase = createSupabaseAdminClient(env)
        const job = await claimMediaJob(supabase, 'media-worker-queue', parsed.data.imageId)
        if (!job) {
          message.ack()
          continue
        }
        await processClaimedMediaJob(job, env)
        message.ack()
      } catch (error) {
        console.error('Failed to process media queue message', {
          imageId: message.body && typeof message.body === 'object' && 'imageId' in message.body
            ? message.body.imageId
            : null,
          error: stringifyError(error),
        })
        message.retry()
      }
    }
  },

  async scheduled(_controller: unknown, env: Env) {
    try {
      const processed = await drainMediaOutbox(env)
      console.log('Completed scheduled media drain', { processed })
    } catch (error) {
      console.error('Failed to drain media outbox', error)
    }

    try {
      await drainMediaDeletionOutbox(env)
    } catch (error) {
      console.error('Failed to drain media deletion outbox', { error: stringifyError(error) })
    }

    try {
      await pruneMediaDeletionOutbox(env)
    } catch (error) {
      console.error('Failed to prune media deletion outbox', error)
    }
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>
  scheduled(controller: unknown, env: Env): Promise<void>
}
