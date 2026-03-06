import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error('Supabase service role is not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function canReadObject(bucket: string, path: string, userId: string | null) {
  const admin = getServiceRoleClient()

  const { data: imageRow, error: imageError } = await admin
    .from('images')
    .select('id, created_by, moderation_status')
    .eq('storage_bucket', bucket)
    .eq('storage_path', path)
    .maybeSingle()

  if (imageError) {
    throw imageError
  }

  if (imageRow) {
    if (imageRow.moderation_status === 'approved') return true
    if (userId && imageRow.created_by === userId) return true
  }

  const privateRef = `private://${bucket}/${path}`
  const { data: cragImageRows, error: cragImageError } = await admin
    .from('crag_images')
    .select('id, linked_image_id, source_image_id')
    .eq('url', privateRef)
    .limit(5)

  if (cragImageError) {
    throw cragImageError
  }

  const linkedIds = Array.from(new Set((cragImageRows || [])
    .flatMap((row) => [row.linked_image_id, row.source_image_id])
    .filter((value): value is string => typeof value === 'string' && !!value)))

  if (linkedIds.length === 0) {
    return false
  }

  const { data: linkedImages, error: linkedError } = await admin
    .from('images')
    .select('id, created_by, moderation_status')
    .in('id', linkedIds)

  if (linkedError) {
    throw linkedError
  }

  return (linkedImages || []).some((row) => row.moderation_status === 'approved' || (!!userId && row.created_by === userId))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path: pathSegments } = await params
  const objectPath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''

  if (!bucket || !objectPath) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const allowed = await canReadObject(bucket, objectPath, user?.id || null)

    if (!allowed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const admin = getServiceRoleClient()
    const { data, error } = await admin.storage.from(bucket).download(objectPath)
    if (error || !data) {
      return NextResponse.json({ error: 'Failed to load media' }, { status: 404 })
    }

    const bytes = await data.arrayBuffer()
    const contentType = data.type || 'application/octet-stream'

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Media proxy error:', error)
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 })
  }
}
