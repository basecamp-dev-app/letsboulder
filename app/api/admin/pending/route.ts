import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    const adminFromProfile = profile?.is_admin === true
    const hasAuthAdmin = user.app_metadata?.gsyrocks_admin === true

    if (!adminFromProfile && !hasAuthAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select(`
        id,
        url,
        status,
        created_at,
        latitude,
        longitude,
        crag_id,
        crags (
          name
        ),
        climbs (
          id,
          name,
          grade
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (imagesError) {
      return createErrorResponse(imagesError, 'Error fetching pending images')
    }

    const result = (images || []).map(img => ({
      ...img,
      route_count: img.climbs?.length || 0
    }))

    return NextResponse.json(result)
  } catch (error) {
    return createErrorResponse(error, 'Error fetching pending images')
  }
}
