import { NextRequest } from 'next/server'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createCrag, getCragsInfo, listAdminCrags } from '@/features/crags/server'
import { requireAdmin } from '@/features/admin/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const adminMode = searchParams.get('admin') === 'true'

  if (!adminMode) {
    return getCragsInfo(`${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours`)
  }

  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!

  return listAdminCrags(admin.context.supabase)
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  return createCrag(request, middlewareResult.supabase)
}
