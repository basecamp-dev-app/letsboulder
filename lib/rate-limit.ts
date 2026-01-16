interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const RATE_LIMITS = {
  externalApi: { windowMs: 60 * 1000, maxRequests: 30 },
  authenticatedWrite: { windowMs: 60 * 60 * 1000, maxRequests: 50 },
  publicSearch: { windowMs: 60 * 1000, maxRequests: 100 },
  sensitive: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  strict: { windowMs: 60 * 1000, maxRequests: 5 },
} as const

type RateLimitKey = keyof typeof RATE_LIMITS

function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

function getIdentifier(request: Request, userId?: string): string {
  if (userId) {
    return `user:${userId}`
  }
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}

export function rateLimit(
  request: Request,
  configKey: RateLimitKey,
  userId?: string
): { success: boolean; remaining: number; resetTime: number } {
  cleanupExpiredEntries()

  const identifier = getIdentifier(request, userId)
  const config = RATE_LIMITS[configKey]
  const now = Date.now()
  const existing = rateLimitStore.get(identifier)

  if (!existing || now > existing.resetTime) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    rateLimitStore.set(identifier, newEntry)
    return { success: true, remaining: config.maxRequests - 1, resetTime: newEntry.resetTime }
  }

  if (existing.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetTime: existing.resetTime }
  }

  existing.count++
  rateLimitStore.set(identifier, existing)
  return { success: true, remaining: config.maxRequests - existing.count, resetTime: existing.resetTime }
}

export function createRateLimitResponse(
  result: { success: boolean; remaining: number; resetTime: number },
  retryAfter?: number
): Response {
  const headers = {
    'X-RateLimit-Limit': String(RATE_LIMITS.externalApi.maxRequests),
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

export type { RateLimitConfig, RateLimitEntry }
export { RATE_LIMITS }
