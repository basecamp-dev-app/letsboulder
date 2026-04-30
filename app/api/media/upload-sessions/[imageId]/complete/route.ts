import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getMediaModerationConfig } from '@/lib/media/config'
import { ensurePrivateObjectExists } from '@/lib/media/r2'
import { parseWithSchema } from '@/lib/api-validation'

interface ImageRow {
  id: string
  created_by: string | null
  original_bucket: string | null
  original_key: string | null
  processing_status: string | null
}

const completeUploadSchema = z.object({
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']).optional(),
})

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
      .select('id, created_by, original_bucket, original_key, processing_status')
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

    if (image.processing_status === 'ready') {
      return NextResponse.json({
        success: true,
        imageId: image.id,
        status: 'ready',
      })
    }

    await ensurePrivateObjectExists(image.original_key)

    const moderation = getMediaModerationConfig()
    const autoApprove = !moderation.enabled || moderation.provider === 'disabled'

    const { error: queueError } = await supabase.rpc('queue_media_ingest_job', {
      p_image_id: image.id,
      p_original_bucket: image.original_bucket,
      p_original_key: image.original_key,
      p_storage_provider: 'r2',
      p_purpose: purpose,
      p_triggered_by_user_id: user.id,
      p_trigger: 'upload',
      p_auto_approve: autoApprove,
    })

    if (queueError) {
      return createErrorResponse(queueError, 'Failed to queue image for ingest')
    }

    return NextResponse.json({
      success: true,
      imageId: image.id,
      status: 'queued',
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to finalize upload session')
  }
}
