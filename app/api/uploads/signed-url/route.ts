import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import { createSignedObjectUrl } from '@/lib/media/object-urls'

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get('bucket')
  const path = request.nextUrl.searchParams.get('path')

  if (!bucket || !path) {
    return NextResponse.json({ error: 'Missing bucket or path' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
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

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const ownershipClient = supabase as unknown as Parameters<typeof userOwnsUploadedObject>[0]
  if (!(await userOwnsUploadedObject(ownershipClient, user.id, bucket, path))) {
    return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 })
  }

  const signedUrl = await createSignedObjectUrl(bucket, path, supabase)
  if (!signedUrl) {
    return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl })
}
