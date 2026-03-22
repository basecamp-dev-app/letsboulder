import { createSupabaseAdminClient, type Env, type MessageBatch } from './supabase'
import { MEDIA_FORMATS, MEDIA_VARIANT_WIDTHS, getVariantWidth, type MediaFormatKey, type MediaVariantKey } from './config'
import { mediaIngestJobSchema, type MediaIngestJobPayload } from './schema'

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

function buildOriginPath(originalKey: string): string {
  return `/origin/${originalKey.split('/').map(encodeURIComponent).join('/')}`
}

function buildMediaPath(originalKey: string, variant: MediaVariantKey, format: MediaFormatKey): string {
  const originPath = `/${originalKey.split('/').map(encodeURIComponent).join('/')}`
  return `${originPath}?variant=${variant}&format=${format}`
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

function parseFormat(value: string | null): MediaFormatKey {
  if (value === 'avif' || value === 'webp' || value === 'jpeg') {
    return value
  }

  return 'webp'
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
      moderation_status: 'approved',
      moderation_provider: env.MEDIA_MODERATION_PROVIDER === 'aws_rekognition' ? 'aws_rekognition' : 'disabled',
      moderation_labels: [],
      moderation_error: null,
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
  headers.set('Cache-Control', 'private, no-store')

  return new Response(object.body, { headers })
}

async function handleMedia(request: Request, env: Env, url: URL) {
  const objectKey = url.pathname.substring(1)
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
    .join('/')

  if (!objectKey) {
    return new Response('Not found', { status: 404 })
  }

  const variant = url.searchParams.get('variant')
  const width = getVariantWidth(variant)
  if (!width) {
    return json({ error: 'Invalid variant' }, { status: 400 })
  }

  const format = parseFormat(url.searchParams.get('format'))
  const originUrl = new URL(buildOriginPath(objectKey), env.MEDIA_HOST)
  const response = await fetch(originUrl.toString(), {
    headers: {
      'X-Internal-Secret': env.INTERNAL_ORIGIN_SECRET,
    },
    cf: {
      image: {
        width,
        format,
        fit: 'scale-down',
        metadata: 'keep',
      },
    },
  } as RequestInit & { cf: { image: { width: number; format: MediaFormatKey; fit: 'scale-down'; metadata: 'keep' } } })

  if (!response.ok) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Vary', 'Accept')
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

        if (env.ENABLE_MODERATION === 'true' && env.MEDIA_MODERATION_PROVIDER === 'aws_rekognition') {
          throw new Error('AWS Rekognition moderation is not implemented in the Cloudflare worker yet')
        }

        await processJob(parsed.data, env)
        message.ack()
      } catch (error) {
        console.error('Failed to process media queue message', error)
        message.retry()
      }
    }
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void>
}
