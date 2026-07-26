import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { requireAdminFromSupabase, voteOnModerationQueueItem } from '@/features/admin/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: queueId } = await params

  const { supabase, userId } = middlewareResult

  if (!queueId) {
    return NextResponse.json({ error: 'Queue ID required' }, { status: 400 })
  }

  const adminError = await requireAdminFromSupabase(supabase)
  if (adminError) return adminError

  return voteOnModerationQueueItem(request, supabase, userId, queueId)
}
