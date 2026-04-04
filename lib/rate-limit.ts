import { checkRateLimit } from '@/lib/upstash-redis'

const RATE_LIMITS = {
  externalApi: { windowMs: 60 * 1000, maxRequests: 30 },
  geoDetect: { windowMs: 60 * 1000, maxRequests: 5 },
  clickSink: { windowMs: 60 * 1000, maxRequests: 10 },
  authenticatedWrite: { windowMs: 60 * 60 * 1000, maxRequests: 50 },
  publicSearch: { windowMs: 60 * 1000, maxRequests: 100 },
  sensitive: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  strict: { windowMs: 60 * 1000, maxRequests: 5 },
  submissions: { windowMs: 60 * 1000, maxRequests: 20 },
  signedUrls: { windowMs: 60 * 1000, maxRequests: 30 },
  uploadSessionCreate: { windowMs: 60 * 1000, maxRequests: 12 },
  uploadSessionComplete: { windowMs: 60 * 1000, maxRequests: 20 },
} as const

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