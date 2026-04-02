import { NextRequest, NextResponse } from 'next/server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createRateLimitResponse, RATE_LIMITS, rateLimit } from '@/lib/rate-limit'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { validateCsrfToken, setCsrfCookie } from './csrf'

export async function withCsrfProtection(
  request: NextRequest,
  response?: NextResponse
): Promise<{ valid: boolean; response?: NextResponse }> {
  const validationResult = await validateCsrfToken(request)
  
  if (!validationResult) {
    const errorResponse = NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 }
    )
    return { valid: false, response: errorResponse }
  }

  if (response) {
    await setCsrfCookie(response)
    return { valid: true, response }
  }

  return { valid: true }
}

type ApiRateLimitKey = keyof typeof RATE_LIMITS

interface ApiMiddlewareOptions {
  requireCsrf?: boolean
  requireUser?: boolean
  rateLimitKey?: ApiRateLimitKey
  unauthorizedMessage?: string
}

type ApiMiddlewareSuccessWithUser = {
  ok: true
  supabase: ReturnType<typeof getServerClientFromRequest>
  userId: string
}

type ApiMiddlewareSuccessWithoutUser = {
  ok: true
  supabase: ReturnType<typeof getServerClientFromRequest>
  userId: null
}

type ApiMiddlewareFailure = {
  ok: false
  response: Response
}

export async function withApiMiddleware(
  request: NextRequest,
  options?: ApiMiddlewareOptions & { requireUser?: true }
): Promise<ApiMiddlewareSuccessWithUser | ApiMiddlewareFailure>

export async function withApiMiddleware(
  request: NextRequest,
  options: ApiMiddlewareOptions & { requireUser: false }
): Promise<ApiMiddlewareSuccessWithoutUser | ApiMiddlewareFailure>

export async function withApiMiddleware(
  request: NextRequest,
  {
    requireCsrf = true,
    requireUser = true,
    rateLimitKey,
    unauthorizedMessage = 'Unauthorized',
  }: ApiMiddlewareOptions = {}
): Promise<ApiMiddlewareSuccessWithUser | ApiMiddlewareSuccessWithoutUser | ApiMiddlewareFailure> {
  if (requireCsrf) {
    const csrfResult = await withCsrfProtection(request)
    if (!csrfResult.valid) {
      return { ok: false, response: csrfResult.response! }
    }
  }

  const supabase = getServerClientFromRequest(request)

  if (!requireUser) {
    return { ok: true, supabase, userId: null }
  }

  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

  if (authError || !userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: unauthorizedMessage }, { status: 401 }),
    }
  }

  if (rateLimitKey) {
    const rateLimitResult = rateLimit(request, rateLimitKey, userId)
    if (!rateLimitResult.success) {
      return {
        ok: false,
        response: createRateLimitResponse(rateLimitResult),
      }
    }
  }

  return { ok: true, supabase, userId }
}
