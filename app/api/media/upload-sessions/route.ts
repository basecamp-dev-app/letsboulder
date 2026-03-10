import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { getMediaStorageConfig } from '@/lib/media/config'
import { createPrivateUploadUrl } from '@/lib/media/r2'
import { buildOriginalObjectKey, normalizeUploadSessionRequest } from '@/lib/media/upload-session'
import type { MediaUploadSessionResponse } from '@/lib/media/types'

function createAuthedClient(request: NextRequest) {
  const cookies = request.cookies

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    const privateUrl = `private://${storage.privateBucket}/${objectKey}`

    const { error: insertError } = await supabase
      .from('images')
      .insert({
        id: imageId,
        url: privateUrl,
        created_by: user.id,
        width: payload.width,
        height: payload.height,
        storage_bucket: storage.privateBucket,
        storage_path: objectKey,
        storage_provider: 'r2',
        original_bucket: storage.privateBucket,
        original_key: objectKey,
        original_mime_type: payload.contentType,
        original_bytes: payload.byteSize,
        original_width: payload.width,
        original_height: payload.height,
        visibility: 'private',
        moderation_status: 'pending',
        processing_status: 'pending',
        status: 'pending',
      })

    if (insertError) {
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
    return createErrorResponse(error, 'Failed to create upload session')
  }
}
