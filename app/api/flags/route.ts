import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { parsePagination } from '@/lib/pagination'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { listFlags, requireAdminFromSupabase } from '@/features/admin/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const { limit, offset } = parsePagination(searchParams)

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = await rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const adminError = await requireAdminFromSupabase(supabase, userId)
    if (adminError) return adminError

    return listFlags(supabase, status, limit, offset)
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}
