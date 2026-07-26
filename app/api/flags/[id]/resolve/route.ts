import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { requireAdminFromSupabase, resolveFlag } from '@/features/admin/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: flagId } = await params
  const { supabase, userId } = middlewareResult

  if (!flagId) {
    return NextResponse.json({ error: 'Flag ID required' }, { status: 400 })
  }

  const adminError = await requireAdminFromSupabase(supabase)
  if (adminError) return adminError

  return resolveFlag(request, supabase, userId, flagId)
}
