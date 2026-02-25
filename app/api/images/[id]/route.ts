import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: imageId } = await params

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

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: existingImage, error: fetchError } = await supabase
      .from('images')
      .select('id, status, crag_id')
      .eq('id', imageId)
      .single()

    if (fetchError || !existingImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (existingImage.status === 'deleted') {
      return NextResponse.json({ error: 'Image already deleted' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('images')
      .update({ status: 'deleted' })
      .eq('id', imageId)

    if (updateError) {
      return createErrorResponse(updateError, 'Error soft deleting image')
    }

    return NextResponse.json({
      success: true,
      message: 'Image deleted successfully'
    })
  } catch (error) {
    return createErrorResponse(error, 'Image deletion error')
  }
}
