import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

  const expectedPrefix = `${user.id}/`
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 })
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
