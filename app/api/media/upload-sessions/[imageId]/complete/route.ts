import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { enqueueImageIngestJob } from '@/lib/media/jobs'
import { ensurePrivateObjectExists } from '@/lib/media/r2'

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

interface ImageRow {
  id: string
  created_by: string | null
  original_bucket: string | null
  original_key: string | null
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

    const job = await enqueueImageIngestJob({
      imageId: image.id,
      originalBucket: image.original_bucket,
      originalKey: image.original_key,
      storageProvider: 'r2',
      purpose: 'submission_image',
      triggeredByUserId: user.id,
    })

    return NextResponse.json({
      success: true,
      imageId: image.id,
      jobId: job.id,
      status: 'queued',
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to finalize upload session')
  }
}
