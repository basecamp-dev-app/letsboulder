import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse, reportError } from '@/lib/errors'
import { toMediaStatusResponse } from '@/lib/media/media-status'
import { headPrivateObject, getPrivateObjectStream, copyPrivateObject } from '@/lib/media/r2'
import { enqueueMediaWorkerFastPath } from '@/lib/media/worker-enqueue'
import { parseWithSchema } from '@/lib/api-validation'
import { buildImmutableObjectKey, inferExtensionFromMime } from '@/lib/media/upload-session'
import type { Database } from '@/types/database'

type ImageRow = Pick<Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'original_bucket' | 'original_key' | 'original_mime_type' | 'original_bytes' | 'processing_status' | 'moderation_status' | 'visibility' | 'status' | 'upload_purpose' | 'checksum_sha256'>

const completeUploadSchema = z.object({
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']).optional(),
})

const mediaIngestJobPayloadSchema = z.object({
  imageId: z.string().min(1),
  originalBucket: z.string().min(1),
  originalKey: z.string().min(1),
  storageProvider: z.enum(['supabase', 'r2']),
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']),
  triggeredByUserId: z.string().min(1),
  trigger: z.enum(['upload', 'backfill']).optional(),
})

async function enqueueFinalizedMediaJob(job: unknown): Promise<void> {
  const payload = job && typeof job === 'object' && 'payload' in job
    ? mediaIngestJobPayloadSchema.safeParse(job.payload)
    : null
  if (!payload?.success) {
    reportError(new Error('Durable media job returned an invalid enqueue payload'), {
      message: 'Media worker fast-path enqueue skipped; durable processing remains queued',
    })
    return
  }

  await enqueueMediaWorkerFastPath(payload.data).catch(() => false)
}

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/heic': [[0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
}

function isValidMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType]
  if (!signatures) return true

  for (const sig of signatures) {
    if (bytes.length >= sig.length) {
      let match = true
      for (let i = 0; i < sig.length; i++) {
        if (bytes[i] !== sig[i]) {
          match = false
          break
        }
      }
      if (match) return true
    }
  }
  return false
}

async function computeSha256AndCheckMagicBytes(
  stream: ReadableStream<Uint8Array>,
  mimeType: string
): Promise<{ sha256: string; validMagic: boolean }> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  let firstChunk: Uint8Array | null = null
  let validMagic = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      if (!firstChunk) {
        firstChunk = value
        validMagic = isValidMagicBytes(firstChunk, mimeType)
      }
      chunks.push(value)
      totalLength += value.length
    }
  }

  if (!firstChunk || !validMagic) {
    return { sha256: '', validMagic: false }
  }

  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return { sha256, validMagic: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const { imageId } = await params
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'uploadSessionComplete' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const parsedBody = parseWithSchema(completeUploadSchema, await request.json().catch(() => null))
    if (!parsedBody.success) return parsedBody.response
    const purpose = parsedBody.data.purpose || 'submission_image'

    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, original_bucket, original_key, original_mime_type, original_bytes, processing_status, moderation_status, visibility, status, upload_purpose, checksum_sha256')
      .eq('id', imageId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const image = data as ImageRow
    if (!image.created_by || image.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!image.original_bucket || !image.original_key) {
      return NextResponse.json({ error: 'Image original location is incomplete' }, { status: 400 })
    }

    if (image.upload_purpose !== purpose) {
      return NextResponse.json({ error: 'Upload purpose does not match the session' }, { status: 409 })
    }

    if (image.processing_status !== 'pending') {
      return NextResponse.json({ ...toMediaStatusResponse(image, null), uploadCommitted: true })
    }

    if (image.original_key.startsWith(`images/assets/${image.id}/`) && image.checksum_sha256) {
      const { data: job, error: finalizeError } = await supabase.rpc('finalize_media_upload', {
        p_image_id: image.id,
        p_original_key: image.original_key,
        p_checksum_sha256: image.checksum_sha256,
      })
      if (finalizeError) return createErrorResponse(finalizeError, 'Failed to queue image for ingest')
      await enqueueFinalizedMediaJob(job)
      return NextResponse.json({ ...toMediaStatusResponse({ ...image, processing_status: 'queued' }, job), uploadCommitted: true })
    }

    const head = await headPrivateObject(image.original_key)

    if (head.contentLength !== image.original_bytes || head.contentType !== image.original_mime_type) {
      return NextResponse.json({ error: 'Uploaded object mismatch' }, { status: 400 })
    }

    const stream = await getPrivateObjectStream(image.original_key)
    const { sha256, validMagic } = await computeSha256AndCheckMagicBytes(stream, image.original_mime_type)
    
    if (!validMagic) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
    }

    const extension = inferExtensionFromMime(image.original_mime_type)
    const immutableKey = buildImmutableObjectKey(image.id, sha256, extension)

    await copyPrivateObject(image.original_key, immutableKey)

    const { data: job, error: finalizeError } = await supabase.rpc('finalize_media_upload', {
      p_image_id: image.id,
      p_original_key: immutableKey,
      p_checksum_sha256: sha256,
    })

    if (finalizeError) {
      return createErrorResponse(finalizeError, 'Failed to queue image for ingest')
    }

    await enqueueFinalizedMediaJob(job)

    return NextResponse.json({ ...toMediaStatusResponse({
      id: image.id,
      processing_status: 'queued',
      moderation_status: 'pending',
      visibility: 'private',
      status: 'pending',
    }, job), uploadCommitted: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to finalize upload session')
  }
}
