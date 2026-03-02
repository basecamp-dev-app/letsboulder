import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const INTERNAL_USER_ID_HEADER = 'x-internal-user-id'
const CSRF_COOKIE_NAME = 'csrf_token'

const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/map',
  '/logbook',
  '/community',
  '/gym-admin',
  '/settings',
  '/submit',
  '/upload-climb',
  '/crag/',
  '/climb/',
  '/image/',
]

const SESSION_REFRESH_PREFIXES = [
  '/settings',
  '/submit',
  '/admin',
  '/gym-admin',
  '/logbook',
]

const LOCATION_DETECT_MAX_BODY_BYTES = 2 * 1024

type UpstashRedisCtor = new (args: { url: string; token: string }) => unknown
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
let upstashUnavailableWarningLogged = false
let redisClient: unknown | null = null
const upstashLimiters = new Map<string, UpstashRatelimitInstance>()

function mergeResponseMetadata(fromResponse: NextResponse, intoResponse: NextResponse): void {
  fromResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      intoResponse.headers.set(key, value)
    }
  })

  fromResponse.cookies.getAll().forEach((cookie) => {
    intoResponse.cookies.set(cookie)
  })
}

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

function getLimiterConfig(rateLimitBucket: 'search' | 'rankings' | 'write' | 'geo' | 'clicks'): { tokens: number; window: string; prefix: string } {
  if (rateLimitBucket === 'geo') {
    return { tokens: 5, window: '1 m', prefix: 'rl:api:geo' }
  }

  if (rateLimitBucket === 'clicks') {
    return { tokens: 10, window: '1 m', prefix: 'rl:api:clicks' }
  }

  if (rateLimitBucket === 'search') {
    return { tokens: 60, window: '1 m', prefix: 'rl:api:search' }
  }

  if (rateLimitBucket === 'rankings') {
    return { tokens: 120, window: '1 m', prefix: 'rl:api:rankings' }
  }

  return { tokens: 90, window: '1 m', prefix: 'rl:api:write' }
}

function getOrCreateLimiter(
  rateLimitBucket: 'search' | 'rankings' | 'write' | 'geo' | 'clicks',
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

function getApiBucket(pathname: string, method: string): 'search' | 'rankings' | 'write' | 'geo' | 'clicks' | null {
  const normalizedMethod = method.toUpperCase()

  if (pathname.startsWith('/api/locations/detect') && normalizedMethod === 'POST') {
    return 'geo'
  }

  if (pathname.startsWith('/api/gear-clicks') && normalizedMethod === 'POST') {
    return 'clicks'
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

function isAllowedRedirectPath(path: string): boolean {
  return ALLOWED_REDIRECT_PATHS.some(allowed => {
    if (allowed.endsWith('/')) {
      return path.startsWith(allowed)
    }
    return path === allowed
  })
}

function shouldRefreshSupabaseSession(pathname: string, method: string): boolean {
  if (pathname.startsWith('/auth')) return true

  if (isStateChangingMethod(method)) return true

  return SESSION_REFRESH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isPrefetchRequest(request: NextRequest): boolean {
  const purpose = request.headers.get('purpose')
  const routerPrefetch = request.headers.get('next-router-prefetch')
  const middlewarePrefetch = request.headers.get('x-middleware-prefetch')

  return purpose === 'prefetch' || routerPrefetch === '1' || middlewarePrefetch === '1'
}

function shouldSkipSessionRefreshForPrefetch(pathname: string, request: NextRequest): boolean {
  if (!isPrefetchRequest(request)) return false
  if (request.method.toUpperCase() !== 'GET') return false

  return pathname === '/submit' || pathname.startsWith('/submit/') || pathname === '/logbook' || pathname.startsWith('/logbook/')
}

function shouldRequireCsrfEarly(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (!isStateChangingMethod(normalizedMethod)) return false
  if (!pathname.startsWith('/api/')) return false
  if (pathname.startsWith('/api/locations/detect')) return false

  return true
}

export default async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(INTERNAL_USER_ID_HEADER)

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const { pathname, searchParams } = request.nextUrl

  if (shouldRequireCsrfEarly(pathname, request.method)) {
    const csrfHeader = request.headers.get('x-csrf-token')
    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value

    if (!csrfHeader || !csrfCookie) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 })
    }
  }

  if (pathname.startsWith('/api/locations/detect') && request.method.toUpperCase() === 'POST') {
    const contentLengthHeader = request.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isFinite(contentLength) && contentLength > LOCATION_DETECT_MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: 'Request body too large' },
          { status: 413 }
        )
      }
    }
  }

  const rateLimitBucket = process.env.VERCEL_ENV === 'production'
    ? getApiBucket(pathname, request.method)
    : null

  if (rateLimitBucket) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (url && token) {
      try {
        const deps = await getUpstashDeps()
        if (!deps) {
          return supabaseResponse
        }

        const ip = getClientIp(request)
        const ratelimit = getOrCreateLimiter(rateLimitBucket, url, token, deps)

        const { success, limit, remaining, reset } = await ratelimit.limit(ip)

        if (!success) {
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
        }
      } catch (error) {
        if (!upstashUnavailableWarningLogged) {
          upstashUnavailableWarningLogged = true
          console.warn('Upstash rate limiting unavailable:', error)
        }
      }
    }
  }

  if (pathname === '/auth') {
    const redirectTo = searchParams.get('redirect_to')
    if (redirectTo && isAllowedRedirectPath(redirectTo)) {
      supabaseResponse.cookies.set('redirect_to', redirectTo, {
        path: '/',
        maxAge: 60 * 5,
        httpOnly: true,
      })
    }
  }

  if (shouldRefreshSupabaseSession(pathname, request.method) && !shouldSkipSessionRefreshForPrefetch(pathname, request)) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            const updatedResponse = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            })
            mergeResponseMetadata(supabaseResponse, updatedResponse)
            cookiesToSet.forEach(({ name, value, options }) =>
              updatedResponse.cookies.set(name, value, options)
            )
            supabaseResponse = updatedResponse
          },
        },
      }
    )

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        requestHeaders.set(INTERNAL_USER_ID_HEADER, user.id)
        const updatedResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        })
        mergeResponseMetadata(supabaseResponse, updatedResponse)
        supabaseResponse = updatedResponse
      }
    } catch (error) {
      console.error('[Proxy Auth Error]:', error)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
  }

  return supabaseResponse
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/api/locations/detect',
    '/api/gear-clicks/:path*',
    '/auth/:path*',
    '/settings/:path*',
    '/submit/:path*',
    '/admin/:path*',
    '/gym-admin/:path*',
    '/logbook/:path*',
    '/api/notifications/:path*',
    '/api/submissions/:path*',
    '/api/places/:path*',
    '/api/gym-admin/:path*',
    '/api/routes/submit/:path*',
    '/api/settings/:path*',
    '/api/profile/:path*',
    '/api/log-routes/:path*',
    '/api/flags/:path*',
    '/api/moderation/:path*',
    '/api/logs/:path*',
    '/api/crags/report/:path*',
    '/api/climbs/(.*)/status',
    '/api/climbs/(.*)/flag',
    '/api/climbs/(.*)/grade-vote',
    '/api/climbs/(.*)/correction',
    '/api/climbs/(.*)/verify',
    '/api/images/(.*)/flag',
    '/api/images/(.*)/flags',
    '/api/comments/:path*',
    '/api/routes/(.*)/grades',
    '/api/corrections/(.*)/vote',
  ],
}
