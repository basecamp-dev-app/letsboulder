import { NextResponse, type NextRequest } from 'next/server'
import { reportError } from '@/lib/errors'
import { RATE_LIMIT_TIERS, PROXY_BUCKET_TO_TIER } from '@/lib/rate-limit-config'

type UpstashRedisCtor = new (args: { url: string; token: string }) => unknown

type RateLimitBucket =
  | 'search'
  | 'rankings'
  | 'write'
  | 'geo'
  | 'clicks'
  | 'upload_session_create'
  | 'upload_session_complete'
  | 'signed_urls'
  | 'submissions'

type UpstashRatelimitInstance = {
  limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>
}

type UpstashRatelimitCtor = {
  new (args: { redis: unknown; limiter: unknown; prefix: string }): UpstashRatelimitInstance
  slidingWindow: (tokens: number, window: unknown) => unknown
}

type UpstashDeps = {
  Redis: UpstashRedisCtor
  Ratelimit: unknown
}

let upstashDepsPromise: Promise<UpstashDeps | null> | null = null
let upstashMissingWarningLogged = false
let redisClient: unknown | null = null
const upstashLimiters = new Map<string, UpstashRatelimitInstance>()

async function getUpstashDeps(): Promise<UpstashDeps | null> {
  if (!upstashDepsPromise) {
    upstashDepsPromise = Promise.all([
      import('@upstash/redis').catch(() => null),
      import('@upstash/ratelimit').catch(() => null),
    ]).then(([redisModule, ratelimitModule]) => {
      if (!redisModule || !ratelimitModule) {
        if (!upstashMissingWarningLogged) {
          upstashMissingWarningLogged = true
          console.warn('Upstash rate limiting deps missing; skipping')
        }

        return null
      }

      return {
        Redis: redisModule.Redis,
        Ratelimit: ratelimitModule.Ratelimit,
      }
    })
  }

  return upstashDepsPromise
}

function getLimiterConfig(rateLimitBucket: RateLimitBucket): { tokens: number; window: string; prefix: string } {
  const tierKey = PROXY_BUCKET_TO_TIER[rateLimitBucket]
  const tier = RATE_LIMIT_TIERS[tierKey]
  return { tokens: tier.tokens, window: tier.window, prefix: tier.prefix }
}

function getOrCreateLimiter(
  rateLimitBucket: RateLimitBucket,
  url: string,
  token: string,
  deps: UpstashDeps
): UpstashRatelimitInstance {
  const { Redis } = deps
  const Ratelimit = deps.Ratelimit as UpstashRatelimitCtor

  if (!redisClient) {
    redisClient = new Redis({ url, token })
  }

  const config = getLimiterConfig(rateLimitBucket)
  const existingLimiter = upstashLimiters.get(config.prefix)
  if (existingLimiter) return existingLimiter

  const limiter = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(config.tokens, config.window),
    prefix: config.prefix,
  })

  upstashLimiters.set(config.prefix, limiter)
  return limiter
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

function getApiBucket(pathname: string, method: string): RateLimitBucket | null {
  const normalizedMethod = method.toUpperCase()

  if (pathname.startsWith('/api/locations/detect') && normalizedMethod === 'POST') {
    return 'geo'
  }

  if (pathname === '/api/media/upload-sessions' && normalizedMethod === 'POST') {
    return 'upload_session_create'
  }

  if (pathname.match(/^\/api\/media\/upload-sessions\/[^/]+\/complete$/) && normalizedMethod === 'POST') {
    return 'upload_session_complete'
  }

  if ((pathname === '/api/uploads/signed-url' || pathname === '/api/uploads/signed-urls/batch') && normalizedMethod === 'POST') {
    return 'signed_urls'
  }

  if (pathname.startsWith('/api/submissions/') && normalizedMethod === 'POST') {
    return 'submissions'
  }

  if (
    pathname.startsWith('/api/places/search') ||
    pathname.startsWith('/api/places/nearby') ||
    pathname.startsWith('/api/crags/search') ||
    pathname.startsWith('/api/crags/nearby') ||
    pathname.startsWith('/api/regions/search') ||
    pathname.startsWith('/api/locations/search') ||
    pathname.startsWith('/api/images/search')
  ) {
    return 'search'
  }

  if (pathname.startsWith('/api/rankings')) return 'rankings'
  if (isStateChangingMethod(method)) return 'write'

  return null
}

export async function applyProxyRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const rateLimitBucket = process.env.VERCEL_ENV === 'production'
    ? getApiBucket(request.nextUrl.pathname, request.method)
    : null

  if (!rateLimitBucket) return null

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const deps = await getUpstashDeps()
    if (!deps) return null

    const ip = getClientIp(request)
    const ratelimit = getOrCreateLimiter(rateLimitBucket, url, token, deps)
    const { success, limit, remaining, reset } = await ratelimit.limit(ip)

    if (success) return null

    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
        },
      }
    )
  } catch (error) {
    reportError(error, { message: 'Upstash rate limiting unavailable in proxy', level: 'warning' })
    return null
  }
}
