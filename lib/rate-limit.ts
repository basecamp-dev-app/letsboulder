interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

interface RateLimitEntry {
  count: number
  resetTime: number
  lastSeen: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const MAX_STORE_SIZE = 10000
const STALE_ENTRY_TTL_MS = 24 * 60 * 60 * 1000

const RATE_LIMITS = {
  externalApi: { windowMs: 60 * 1000, maxRequests: 30 },
  authenticatedWrite: { windowMs: 60 * 60 * 1000, maxRequests: 50 },
  publicSearch: { windowMs: 60 * 1000, maxRequests: 100 },
  sensitive: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  strict: { windowMs: 60 * 1000, maxRequests: 5 },
} as const

type RateLimitKey = keyof typeof RATE_LIMITS

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime || now - entry.lastSeen > STALE_ENTRY_TTL_MS) {
      rateLimitStore.delete(key)
    }
  }
}

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

function enforceStoreLimit() {
  if (rateLimitStore.size <= MAX_STORE_SIZE) return

  const entries = [...rateLimitStore.entries()]
  entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen)

  const toDelete = rateLimitStore.size - MAX_STORE_SIZE
  for (let i = 0; i < toDelete; i += 1) {
    rateLimitStore.delete(entries[i][0])
  }
}

export function rateLimit(
  request: Request,
  configKey: RateLimitKey,
  userId?: string
): { success: boolean; remaining: number; resetTime: number; limit: number } {
  const now = Date.now()
  cleanupExpiredEntries(now)
  enforceStoreLimit()

  const identifier = getIdentifier(request, configKey, userId)
  const config = RATE_LIMITS[configKey]
  const existing = rateLimitStore.get(identifier)

  if (!existing || now > existing.resetTime) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
      lastSeen: now,
    }
    rateLimitStore.set(identifier, newEntry)
    return { success: true, remaining: config.maxRequests - 1, resetTime: newEntry.resetTime, limit: config.maxRequests }
  }

  existing.lastSeen = now

  if (existing.count >= config.maxRequests) {
    rateLimitStore.set(identifier, existing)
    return { success: false, remaining: 0, resetTime: existing.resetTime, limit: config.maxRequests }
  }

  existing.count++
  rateLimitStore.set(identifier, existing)
  return { success: true, remaining: config.maxRequests - existing.count, resetTime: existing.resetTime, limit: config.maxRequests }
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

export type { RateLimitConfig, RateLimitEntry }
export { RATE_LIMITS }
