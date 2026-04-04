import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse, reportError } from '@/lib/errors'
import { getMediaModerationConfig } from '@/lib/media/config'
import { ensurePrivateObjectExists } from '@/lib/media/r2'
import { serverEnv } from '@/lib/env'
import { parseWithSchema } from '@/lib/api-validation'

interface ImageRow {
  id: string
  created_by: string | null
  original_bucket: string | null
  original_key: string | null
}

const completeUploadSchema = z.object({
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']).optional(),
})

async function enqueueMediaIngest(payload: {
  imageId: string
  originalBucket: string
  originalKey: string
  storageProvider: 'r2'
  purpose: 'submission_image' | 'draft_image' | 'crag_image'
  triggeredByUserId: string
  trigger: 'upload'
}) {
  const workerUrl = serverEnv.CF_MEDIA_WORKER_URL?.trim()
  const workerSecret = serverEnv.CF_MEDIA_WORKER_SECRET?.trim()

  if (!workerUrl || !workerSecret) {
    throw new Error('Cloudflare media worker ingress is not configured')
  }

  const response = await fetch(`${workerUrl.replace(/\/$/, '')}/enqueue`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `Failed to enqueue media ingest (${response.status})`)
  }
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
      .select('id, created_by, original_bucket, original_key')
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

    await ensurePrivateObjectExists(image.original_key)

    const moderation = getMediaModerationConfig()
    const autoApprove = !moderation.enabled || moderation.provider === 'disabled'

    if (autoApprove) {
      const { error: approveError } = await supabase
        .from('images')
        .update({
          visibility: 'public',
          moderation_status: 'approved',
          processing_status: 'ready',
          status: 'approved',
        })
        .eq('id', image.id)
        .eq('created_by', user.id)

      if (approveError) {
        return createErrorResponse(approveError, 'Failed to auto-approve upload')
      }

      return NextResponse.json({
        success: true,
        imageId: image.id,
        status: 'approved',
      })
    }

    const { error: updateError } = await supabase
      .from('images')
      .update({
        processing_status: 'queued',
      })
      .eq('id', image.id)
      .eq('created_by', user.id)

    if (updateError) {
      return createErrorResponse(updateError, 'Failed to queue image for ingest')
    }

    void enqueueMediaIngest({
      imageId: image.id,
      originalBucket: image.original_bucket,
      originalKey: image.original_key,
      storageProvider: 'r2',
      purpose,
      triggeredByUserId: user.id,
      trigger: 'upload',
    }).catch((enqueueError: unknown) => {
      reportError(enqueueError instanceof Error ? enqueueError : new Error('Failed to enqueue media ingest after upload completion'), {
        message: 'Failed to enqueue media ingest after upload completion',
        extra: {
          imageId: image.id,
          purpose,
          error: enqueueError instanceof Error ? enqueueError.message : enqueueError,
        },
      })
    })

    return NextResponse.json({
      success: true,
      imageId: image.id,
      status: 'queued',
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to finalize upload session')
  }
}
