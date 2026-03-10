import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { deleteObject } from '@/lib/media/r2'

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
  processing_status: string | null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { imageId } = await params
  const supabase = createAuthedClient(request)

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('images')
      .select('id, created_by, original_bucket, original_key, processing_status')
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
