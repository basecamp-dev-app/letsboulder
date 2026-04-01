import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getMediaModerationConfig } from '@/lib/media/config'
import { ensurePrivateObjectExists } from '@/lib/media/r2'
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

interface ImageRow {
  id: string
  created_by: string | null
  original_bucket: string | null
  original_key: string | null
}

interface CompleteUploadBody {
  purpose?: 'submission_image' | 'draft_image' | 'crag_image'
}

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
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = createAuthedClient(request)

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as CompleteUploadBody | null
    const purpose = body?.purpose === 'draft_image' || body?.purpose === 'crag_image' || body?.purpose === 'submission_image'
      ? body.purpose
      : 'submission_image'

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
      console.error('Failed to enqueue media ingest after upload completion', {
        imageId: image.id,
        purpose,
        error: enqueueError instanceof Error ? enqueueError.message : enqueueError,
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
