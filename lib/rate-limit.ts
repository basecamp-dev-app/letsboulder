import { checkRateLimit } from '@/lib/upstash-redis'
import { RATE_LIMIT_TIERS } from '@/lib/rate-limit-config'

const RATE_LIMITS = Object.fromEntries(
  Object.entries(RATE_LIMIT_TIERS).map(([key, tier]) => [
    key,
    { windowMs: tier.windowMs, maxRequests: tier.tokens },
  ])
) as { [K in keyof typeof RATE_LIMIT_TIERS]: { windowMs: number; maxRequests: number } }

type RateLimitKey = keyof typeof RATE_LIMITS

function isValidIp(value: string | null | undefined): value is string {
  if (!value) return false
  const ip = value.trim()
  if (!ip || ip.length > 64) return false
  return /^[a-fA-F0-9:.]+$/.test(ip) || ip === 'localhost'
}

function getTrustedIp(request: Request): string {
  const requestWithIp = request as Request & { ip?: string | null }
  if (isValidIp(requestWithIp.ip)) {
    return requestWithIp.ip.trim()
  }

  const vercelIp = request.headers.get('x-vercel-forwarded-for')
  if (isValidIp(vercelIp)) {
    return vercelIp.trim()
  }

  const cfIp = request.headers.get('cf-connecting-ip')
  if (isValidIp(cfIp)) {
    return cfIp.trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (isValidIp(realIp)) {
    return realIp.trim()
  }

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstHop = forwarded.split(',')[0]?.trim()
    if (isValidIp(firstHop)) {
      return firstHop
    }
  }

  return 'unknown'
}

function getIdentifier(request: Request, configKey: RateLimitKey, userId?: string): string {
  if (userId) {
    return `cfg:${configKey}:user:${userId}`
  }

  const ip = getTrustedIp(request)
  return `cfg:${configKey}:ip:${ip}`
}

export async function rateLimit(
  request: Request,
  configKey: RateLimitKey,
  userId?: string
): Promise<{ success: boolean; remaining: number; resetTime: number; limit: number }> {
  const identifier = getIdentifier(request, configKey, userId)

  const result = await checkRateLimit(identifier, configKey)

  if (result.success) {
    return {
      success: true,
      remaining: result.remaining,
      resetTime: result.reset,
      limit: result.limit,
    }
  }

  return {
    success: false,
    remaining: result.remaining,
    resetTime: result.reset,
    limit: result.limit,
  }
}

export function createRateLimitResponse(
  result: { success: boolean; remaining: number; resetTime: number; limit?: number },
  retryAfter?: number
): Response {
  const headers = {
    'X-RateLimit-Limit': String(result.limit || RATE_LIMITS.externalApi.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
  }

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', retry_after: retryAfter }),
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(retryAfter || Math.ceil((result.resetTime - Date.now()) / 1000)),
          'Content-Type': 'application/json',
        },
      }
    )
  }

  return new Response(null, { headers })
}

export { RATE_LIMITS }
export type { RateLimitKey }