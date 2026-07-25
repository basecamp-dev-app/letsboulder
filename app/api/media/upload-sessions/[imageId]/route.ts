import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { deleteObject } from '@/lib/media/r2'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { toMediaStatusResponse } from '@/lib/media/media-status'
import type { Database } from '@/types/database'

const deleteUploadSessionParamsSchema = z.object({
  imageId: z.string().min(1, 'imageId is required'),
})

type ImageRow = Pick<Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'original_bucket' | 'original_key' | 'processing_status' | 'moderation_status' | 'visibility' | 'status'>

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireCsrf: false, requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const validation = parseWithSchema(deleteUploadSessionParamsSchema, await params)
  if (!validation.success) return validation.response

  const { supabase } = middlewareResult
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, processing_status, moderation_status, visibility, status')
      .eq('id', validation.data.imageId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    if (data.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const admin = getAdminClientWithAudit('Read owner-scoped media upload status')
    const { data: latestJob, error: jobError } = await admin
      .from('media_jobs')
      .select('status, attempts, max_attempts')
      .eq('image_id', data.id)
      .eq('job_type', 'ingest_image')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (jobError) {
      return createErrorResponse(jobError, 'Failed to read upload status')
    }

    return NextResponse.json(toMediaStatusResponse(data, latestJob))
  } catch (error) {
    return createErrorResponse(error, 'Failed to read upload status')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'authenticatedWrite' })
  if (!middlewareResult.ok) return middlewareResult.response

  const rawParams = await params
  const validation = parseWithSchema(deleteUploadSessionParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { imageId } = validation.data
  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, original_bucket, original_key, processing_status, moderation_status, visibility, status')
      .eq('id', imageId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const image = data as ImageRow
    if (image.created_by !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (image.processing_status === 'ready') {
      return NextResponse.json({ error: 'Processed images cannot be deleted from this endpoint' }, { status: 409 })
    }

    if (image.original_bucket && image.original_key) {
      await deleteObject(image.original_bucket, image.original_key).catch(() => null)
    }

    const { error: deleteError } = await supabase
      .from('images')
      .delete()
      .eq('id', image.id)
      .eq('created_by', user.id)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Failed to delete upload session')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete upload session')
  }
}
