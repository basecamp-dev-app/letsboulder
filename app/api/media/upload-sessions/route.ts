import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse, reportError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getMediaStorageConfig } from '@/lib/media/config'
import { createPrivateUploadUrl } from '@/lib/media/r2'
import { buildStagingObjectKey, normalizeUploadSessionRequest } from '@/lib/media/upload-session'
import type { MediaUploadSessionResponse } from '@/lib/media/types'
import { parseWithSchema } from '@/lib/api-validation'
import { hasOpenDataConsent, OPEN_DATA_CONSENT_REQUIRED } from '@/features/legal/lib/open-data-consent'

const uploadSessionSchema = z.object({
  clientUploadId: z.string().uuid(),
  purpose: z.enum(['submission_image', 'draft_image', 'crag_image']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  byteSize: z.number().int().positive().max(20 * 1024 * 1024),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  captureDate: z.string().nullable().optional(),
  gpsData: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).nullable().optional(),
  draftId: z.string().optional(),
  cragId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'uploadSessionCreate' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!(await hasOpenDataConsent(supabase))) {
      return NextResponse.json({
        code: OPEN_DATA_CONSENT_REQUIRED,
        error: 'Accept the Open Data Contributor Terms to upload media.',
      }, { status: 428 })
    }

    const parsedBody = parseWithSchema(uploadSessionSchema, await request.json().catch(() => null))
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const payload = normalizeUploadSessionRequest(body)

    if (payload.purpose === 'draft_image' && !payload.draftId) {
      return NextResponse.json({ error: 'draftId is required for draft uploads' }, { status: 400 })
    }

    if (payload.purpose === 'crag_image' && !payload.cragId) {
      return NextResponse.json({ error: 'cragId is required for crag image uploads' }, { status: 400 })
    }

    const existingResult = await supabase
      .from('images')
      .select('id, created_by, original_bucket, original_key, original_mime_type, original_bytes, processing_status, upload_purpose, upload_draft_id, upload_crag_id')
      .eq('created_by', user.id)
      .eq('client_upload_id', body.clientUploadId)
      .maybeSingle()

    if (existingResult.error) {
      return createErrorResponse(existingResult.error, 'Failed to resume image upload session')
    }

    if (existingResult.data) {
      const existing = existingResult.data
      const targetMatches = existing.upload_purpose === payload.purpose
        && (existing.upload_draft_id ?? null) === (payload.draftId ?? null)
        && (existing.upload_crag_id ?? null) === (payload.cragId ?? null)
        && existing.original_mime_type === payload.contentType
        && existing.original_bytes === payload.byteSize
      if (!targetMatches || !existing.original_key) {
        return NextResponse.json({ error: 'Upload session details do not match the original request' }, { status: 409 })
      }

      const uploadTarget = existing.processing_status === 'pending'
        ? await createPrivateUploadUrl(existing.original_key, payload.contentType)
        : null
      return NextResponse.json({
        imageId: existing.id,
        objectKey: existing.original_key,
        bucket: existing.original_bucket || uploadTarget?.bucket || getMediaStorageConfig().privateBucket,
        uploadUrl: uploadTarget?.uploadUrl || '',
        uploadMethod: 'PUT' as const,
        uploadHeaders: uploadTarget?.uploadHeaders || {},
        expiresInSeconds: uploadTarget?.expiresInSeconds || 0,
        uploadCommitted: existing.processing_status !== 'pending',
      } satisfies MediaUploadSessionResponse)
    }

    const imageId = randomUUID()
    const stagingKey = buildStagingObjectKey(imageId, payload)
    const storage = getMediaStorageConfig()
    const privateUrl = `private://${storage.privateBucket}/${stagingKey}`

    const insertPayload = {
      id: imageId,
      url: privateUrl,
      created_by: user.id,
      width: payload.width,
      height: payload.height,
      latitude: payload.gpsData?.latitude ?? null,
      longitude: payload.gpsData?.longitude ?? null,
      capture_date: typeof payload.captureDate === 'string' && payload.captureDate ? payload.captureDate : null,
      storage_bucket: storage.privateBucket,
      storage_path: stagingKey,
      storage_provider: 'r2',
      original_bucket: storage.privateBucket,
      original_key: stagingKey,
      original_mime_type: payload.contentType,
      original_bytes: payload.byteSize,
      original_width: payload.width,
      original_height: payload.height,
      visibility: 'private',
      moderation_status: 'skipped',
      moderation_provider: 'disabled',
      moderation_error: null,
      processing_status: 'pending',
      status: 'pending',
      client_upload_id: body.clientUploadId,
      upload_purpose: payload.purpose,
      upload_draft_id: payload.draftId ?? null,
      upload_crag_id: payload.cragId ?? null,
    }

    const { error: insertError } = await supabase
      .from('images')
      .insert(insertPayload)

    if (insertError) {
      reportError(insertError, {
        message: '[upload-sessions] DB insert failed',
        extra: {
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          userId: user.id,
          imageId,
          objectKey: stagingKey,
        },
      })
      return createErrorResponse(insertError, 'Failed to create image upload session')
    }

    const uploadTarget = await createPrivateUploadUrl(stagingKey, payload.contentType)
    const response: MediaUploadSessionResponse = {
      imageId,
      objectKey: stagingKey,
      bucket: uploadTarget.bucket,
      uploadUrl: uploadTarget.uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders: uploadTarget.uploadHeaders,
      expiresInSeconds: uploadTarget.expiresInSeconds,
      uploadCommitted: false,
    }

    return NextResponse.json(response)
  } catch (error) {
    reportError(error, {
      message: '[upload-sessions] Unexpected error',
      extra: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    })
    return createErrorResponse(error, 'Failed to create upload session')
  }
}
