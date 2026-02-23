import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface UpdateCragRequest {
  name?: string
  rock_type?: string | null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: cragId } = await params

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

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body: UpdateCragRequest = await request.json()

    const { data: existingCrag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name')
      .eq('id', cragId)
      .single()

    if (fetchError || !existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.rock_type !== undefined) updateData.rock_type = body.rock_type

    const { data: updatedCrag, error: updateError } = await supabase
      .from('crags')
      .update(updateData)
      .eq('id', cragId)
      .select('id, name, rock_type, type, latitude, longitude')
      .single()

    if (updateError) {
      return createErrorResponse(updateError, 'Error updating crag')
    }

    await supabase.from('admin_actions').insert({
      user_id: user.id,
      action: 'rename_crag',
      target_id: cragId,
      details: {
        previous_name: existingCrag.name,
        new_name: body.name,
        rock_type: body.rock_type
      }
    })

    return NextResponse.json({
      success: true,
      crag: updatedCrag,
      message: `Crag renamed from "${existingCrag.name}" to "${body.name}"`
    })
  } catch (error) {
    return createErrorResponse(error, 'Error updating crag')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: cragId } = await params

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

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: crag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name')
      .eq('id', cragId)
      .single()

    if (fetchError || !crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const { data: climbData } = await supabase
      .from('climbs')
      .select('id')
      .eq('crag_id', cragId)

    const { data: imageData } = await supabase
      .from('images')
      .select('id')
      .eq('crag_id', cragId)

    const climbCount = climbData?.length || 0
    const imageCount = imageData?.length || 0

    const { error: deleteError } = await supabase
      .from('crags')
      .delete()
      .eq('id', cragId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting crag')
    }

    await supabase.from('admin_actions').insert({
      user_id: user.id,
      action: 'delete_crag',
      target_id: cragId,
      details: {
        crag_name: crag.name,
        climbs_deleted: climbCount,
        images_deleted: imageCount
      }
    })

    return NextResponse.json({
      success: true,
      message: `Crag "${crag.name}" deleted with ${climbCount} climbs and ${imageCount} images`
    })
  } catch (error) {
    return createErrorResponse(error, 'Error deleting crag')
  }
}
