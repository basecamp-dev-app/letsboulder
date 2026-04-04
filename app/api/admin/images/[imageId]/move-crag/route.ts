import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { movePublishedImageToCrag, requireAdminFromSupabase } from '@/features/admin/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const adminError = await requireAdminFromSupabase(supabase, user.id)
  if (adminError) return adminError

  const { imageId } = await params
  if (!imageId) {
    return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
  }

  return movePublishedImageToCrag(request, supabase, user.id, imageId)
}
