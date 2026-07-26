import { createSupabaseAdminClient, type Env, type MessageBatch } from './supabase'
import { MEDIA_FORMATS, MEDIA_VARIANT_WIDTHS, getVariantWidth, type MediaFormatKey, type MediaVariantKey } from './config'
import { mediaIngestJobSchema, type MediaIngestJobPayload, type MediaJobRow } from './schema'

const OUTBOX_WORKER_NAME = 'media-worker-scheduled'
const OUTBOX_DRAIN_LIMIT = 10

interface ImageRow {
  id: string
  created_by: string | null
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
}

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
  return typeof error === 'string' ? error : 'Unknown media job error'
}

function getRetryRunAt(attempts: number): string {
  const backoffMinutes = Math.min(60, 2 ** Math.max(attempts - 1, 0))
  return new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString()
}

function buildMediaPath(originalKey: string, variant: MediaVariantKey, format: MediaFormatKey): string {
  const originPath = `/${originalKey.split('/').map(encodeURIComponent).join('/')}`
  return `${originPath}?variant=${variant}&format=${format}`
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

  await env.MEDIA_QUEUE.send(parsed.data)
  return json({ success: true, status: 'queued' }, { status: 202 })
}

async function loadImage(supabase: ReturnType<typeof createSupabaseAdminClient>, imageId: string) {
  const { data, error } = await supabase
    .from('images')
    .select('id, created_by, original_bucket, original_key, original_width, original_height, original_mime_type, original_bytes, width, height, visibility, processing_status')
    .eq('id', imageId)
    .single()

  if (error) throw error
  return data as ImageRow
}

async function setImageProcessing(supabase: ReturnType<typeof createSupabaseAdminClient>, imageId: string) {
  const { error } = await supabase
    .from('images')
    .update({ processing_status: 'processing' })
    .eq('id', imageId)

  if (error) throw error
}

async function finalizeImage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  env: Env,
  image: ImageRow,
  originalKey: string
) {
  const sourceWidth = image.original_width || image.width
  const sourceHeight = image.original_height || image.height
  const manifest = buildVirtualManifest(originalKey, sourceWidth, sourceHeight)

  const { error } = await supabase
    .from('images')
    .update({
      url: buildMediaPath(originalKey, 'detail', 'jpeg'),
      storage_provider: 'r2',
      variants: manifest,
      visibility: 'public',
      moderation_status: 'skipped',
      moderation_provider: 'disabled',
      moderation_labels: [],
      moderation_error: null,
      moderated_at: null,
      processed_at: new Date().toISOString(),
      processing_status: 'ready',
      status: 'approved',
    })
    .eq('id', image.id)

  if (error) throw error
}

async function processJob(job: MediaIngestJobPayload, env: Env) {
  const head = await env.ORIGINALS_BUCKET.head(job.originalKey)
  if (!head) {
    throw new Error(`Original object not found for ${job.originalKey}`)
  }

  const supabase = createSupabaseAdminClient(env)
  const image = await loadImage(supabase, job.imageId)

  if (!image.original_key || !image.original_bucket) {
    throw new Error(`Image ${job.imageId} is missing original storage metadata`)
  }

  if (image.processing_status === 'ready' && image.visibility === 'public') {
    return
  }

  await setImageProcessing(supabase, image.id)
  await finalizeImage(supabase, env, image, job.originalKey)
}

async function claimMediaJob(supabase: ReturnType<typeof createSupabaseAdminClient>, workerName: string) {
  const { data, error } = await supabase.rpc('claim_media_job', { worker_name: workerName })
  if (error) throw error
  return data as MediaJobRow | null
}

async function markMediaJobCompleted(supabase: ReturnType<typeof createSupabaseAdminClient>, jobId: string) {
  const { error } = await supabase
    .from('media_jobs')
    .update({
      status: 'completed',
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq('id', jobId)

  if (error) throw error
}

export async function markMediaJobsCompletedByImage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  imageId: string
) {
  const { error } = await supabase
    .from('media_jobs')
    .update({
      status: 'completed',
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq('image_id', imageId)
    .in('status', ['queued', 'processing'])

  if (error) throw error
}

async function markMediaJobForRetry(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: MediaJobRow,
  error: unknown
) {
  const errorMessage = stringifyError(error)
  const hasAttemptsRemaining = job.attempts < job.max_attempts

  if (!hasAttemptsRemaining) {
    const { error: jobError } = await supabase
      .from('media_jobs')
      .update({
        status: 'failed',
        locked_at: null,
        locked_by: null,
        last_error: errorMessage,
      })
      .eq('id', job.id)

    if (jobError) throw jobError

    const { error: imageError } = await supabase
      .from('images')
      .update({ processing_status: 'failed' })
      .eq('id', job.image_id)

    if (imageError) throw imageError
    return
  }

  const { error: retryError } = await supabase
    .from('media_jobs')
    .update({
      status: 'queued',
      locked_at: null,
      locked_by: null,
      last_error: errorMessage,
      run_at: getRetryRunAt(job.attempts),
    })
    .eq('id', job.id)

  if (retryError) throw retryError
}

async function failMediaJobPermanently(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: MediaJobRow,
  error: unknown
) {
  const errorMessage = stringifyError(error)
  const { error: jobError } = await supabase
    .from('media_jobs')
    .update({
      status: 'failed',
      locked_at: null,
      locked_by: null,
      last_error: errorMessage,
    })
    .eq('id', job.id)

  if (jobError) throw jobError

  const { error: imageError } = await supabase
    .from('images')
    .update({ processing_status: 'failed' })
    .eq('id', job.image_id)

  if (imageError) throw imageError
}

async function processClaimedMediaJob(job: MediaJobRow, env: Env) {
  const supabase = createSupabaseAdminClient(env)
  const parsed = mediaIngestJobSchema.safeParse(job.payload)

  if (!parsed.success) {
    await failMediaJobPermanently(supabase, job, new Error('Invalid media ingest payload'))
    return
  }

  try {
    await processJob(parsed.data, env)
    await markMediaJobCompleted(supabase, job.id)
  } catch (error) {
    await markMediaJobForRetry(supabase, job, error)
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

  const staticVariantMatch = pathname.match(/^(images\/[^/]+\/v1\/)([a-z0-9_-]+)\.([a-z]+)$/i)
  let objectKey: string
  let variant: string | null = null
  let width: number | null = null

  if (staticVariantMatch) {
    const uuid = staticVariantMatch[1]?.replace(/^images\//, '').replace(/\/v1\/$/, '')
    variant = staticVariantMatch[2] ?? null
    width = getVariantWidth(variant)
    objectKey = `images/originals/${uuid}/original.jpg`
  } else {
    objectKey = pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
      .join('/')

    variant = url.searchParams.get('variant')
    width = getVariantWidth(variant)
  }

  if (!objectKey) {
    return new Response('Not found', { status: 404 })
  }

  if (!width) {
    return json({ error: 'Invalid variant' }, { status: 400 })
  }

  const formatParam = url.searchParams.get('format')
  const format = formatParam === 'avif' ? 'avif' : formatParam === 'auto' ? 'auto' : 'webp'
  const originUrl = `${env.R2_ORIGIN_URL}/${objectKey.split('/').map(encodeURIComponent).join('/')}`

  const response = await fetch(originUrl, {
    cf: {
      image: {
        width,
        format,
        fit: 'scale-down',
        metadata: 'none',
      },
    },
  } as RequestInit & { cf: { image: { width: number; format: string; fit: 'scale-down'; metadata: 'none' } } })

  if (!response.ok) {
    return new Response('Not found', { status: 404 })
  }

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Vary', 'Accept')
  headers.set('Access-Control-Allow-Origin', '*')
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
        const parsed = mediaIngestJobSchema.safeParse(message.body)
        if (!parsed.success) {
          message.ack()
          continue
        }

        await processJob(parsed.data, env)
        await markMediaJobsCompletedByImage(createSupabaseAdminClient(env), parsed.data.imageId)
        message.ack()
      } catch (error) {
        console.error('Failed to process media queue message', error)
        message.retry()
      }
    }
  },

  async scheduled(_controller: unknown, env: Env) {
    try {
      await drainMediaOutbox(env)
    } catch (error) {
      console.error('Failed to drain media outbox', error)
    }
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>
  scheduled(controller: unknown, env: Env): Promise<void>
}
