import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createPlace } from '@/features/community/server'

export async function GET() {
  return NextResponse.json({ message: 'Places endpoint', method: 'POST', rate_limit: `${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours` })
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  return createPlace(request, middlewareResult.supabase)
}
