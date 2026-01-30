import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: imageId } = await params

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

    const body: { status: 'approved' | 'rejected' } = await request.json()

    if (!['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status. Must be approved or rejected' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('images')
      .update({ status: body.status })
      .eq('id', imageId)

    if (updateError) {
      return createErrorResponse(updateError, 'Error updating image status')
    }

    return NextResponse.json({ success: true, status: body.status })
  } catch (error) {
    return createErrorResponse(error, 'Error updating image status')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: imageId } = await params

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

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, url, status, created_at')
      .eq('id', imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    return NextResponse.json(image)
  } catch (error) {
    return createErrorResponse(error, 'Error fetching image status')
  }
}
