import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { listModerationQueue, requireAdminFromSupabase } from '@/features/admin/server'



export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const cragId = searchParams.get('crag_id')

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const adminError = await requireAdminFromSupabase(supabase, userId)
    if (adminError) return adminError

    const rateLimitResult = await rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    return listModerationQueue(supabase, status, cragId)
  } catch (error) {
    return createErrorResponse(error, 'Queue fetch error')
  }
}
