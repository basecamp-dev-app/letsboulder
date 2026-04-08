import { NextRequest, NextResponse } from 'next/server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createRateLimitResponse, RATE_LIMITS, rateLimit } from '@/lib/rate-limit'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { validateCsrfToken, setCsrfCookie } from './csrf'

function isTrustedServerActionRequest(request: NextRequest): boolean {
  if (!request.headers.get('next-action')) return false

  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false

  try {
    const originUrl = new URL(origin)
    return originUrl.host === host
  } catch {
    return false
  }
}

export async function withCsrfProtection(
  request: NextRequest,
  response?: NextResponse
): Promise<{ valid: boolean; response?: NextResponse }> {
  if (isTrustedServerActionRequest(request)) {
    return response ? { valid: true, response } : { valid: true }
  }

  const validationResult = await validateCsrfToken(request)
  
  if (!validationResult) {
    const errorResponse = NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 }
    )
    return { valid: false, response: errorResponse }
  }

  if (response) {
    await setCsrfCookie(request, response)
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

  let resolvedUserId: string | null = null

  if (requireUser || rateLimitKey) {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (requireUser && (authError || !userId)) {
      return {
        ok: false,
        response: NextResponse.json({ error: unauthorizedMessage }, { status: 401 }),
      }
    }

    resolvedUserId = userId
  }

  if (rateLimitKey) {
    const rateLimitResult = await rateLimit(request, rateLimitKey, resolvedUserId ?? undefined)
    if (!rateLimitResult.success) {
      return {
        ok: false,
        response: createRateLimitResponse(rateLimitResult),
      }
    }
  }

  if (!requireUser) {
    return { ok: true, supabase, userId: null }
  }

  return { ok: true, supabase, userId: resolvedUserId! }
}
