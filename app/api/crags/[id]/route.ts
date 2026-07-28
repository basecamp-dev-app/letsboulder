import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { requireAdminFromSupabase } from '@/features/admin/server'
import { deleteCrag, updateCrag } from '@/features/crags/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'authenticatedWrite' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params
  const { supabase } = middlewareResult

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!cragId) {
    return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
  }

  const adminError = await requireAdminFromSupabase(supabase)
  if (adminError) return adminError

  return updateCrag(request, supabase, user.id, cragId)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false, rateLimitKey: 'sensitive' })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params
  const { supabase } = middlewareResult

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!cragId) {
    return NextResponse.json({ error: 'Crag ID required' }, { status: 400 })
  }

  const adminError = await requireAdminFromSupabase(supabase)
  if (adminError) return adminError

  return deleteCrag(request, supabase, cragId)
}
