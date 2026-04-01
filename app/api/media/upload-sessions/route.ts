import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { getMediaModerationConfig, getMediaStorageConfig } from '@/lib/media/config'
import { createPrivateUploadUrl } from '@/lib/media/r2'
import { buildOriginalObjectKey, normalizeUploadSessionRequest } from '@/lib/media/upload-session'
import type { MediaUploadSessionResponse } from '@/lib/media/types'
import { serverEnv } from '@/lib/env'

function createAuthedClient(request: NextRequest) {
  const cookies = request.cookies

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
        setAll() {},
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = createAuthedClient(request)

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const payload = normalizeUploadSessionRequest(body)

    if (payload.purpose === 'draft_image' && !payload.draftId) {
      return NextResponse.json({ error: 'draftId is required for draft uploads' }, { status: 400 })
    }

    if (payload.purpose === 'crag_image' && !payload.cragId) {
      return NextResponse.json({ error: 'cragId is required for crag image uploads' }, { status: 400 })
    }

    const imageId = randomUUID()
    const objectKey = buildOriginalObjectKey(imageId, payload)
    const storage = getMediaStorageConfig()
    const moderation = getMediaModerationConfig()
    const autoApprove = !moderation.enabled || moderation.provider === 'disabled'
    const privateUrl = `private://${storage.privateBucket}/${objectKey}`

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
      storage_path: objectKey,
      storage_provider: 'r2',
      original_bucket: storage.privateBucket,
      original_key: objectKey,
      original_mime_type: payload.contentType,
      original_bytes: payload.byteSize,
      original_width: payload.width,
      original_height: payload.height,
      visibility: autoApprove ? 'public' : 'private',
      moderation_status: autoApprove ? 'approved' : 'pending',
      processing_status: autoApprove ? 'ready' : 'pending',
      status: autoApprove ? 'approved' : 'pending',
    }

    const { error: insertError } = await supabase
      .from('images')
      .insert(insertPayload)

    if (insertError) {
      console.error('[upload-sessions] DB insert failed', {
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        userId: user.id,
        imageId,
        objectKey,
      })
      return createErrorResponse(insertError, 'Failed to create image upload session')
    }

    const uploadTarget = await createPrivateUploadUrl(objectKey, payload.contentType)
    const response: MediaUploadSessionResponse = {
      imageId,
      objectKey,
      bucket: uploadTarget.bucket,
      uploadUrl: uploadTarget.uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders: uploadTarget.uploadHeaders,
      expiresInSeconds: uploadTarget.expiresInSeconds,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[upload-sessions] Unexpected error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return createErrorResponse(error, 'Failed to create upload session')
  }
}
