import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

function getApiBucket(pathname: string, method: string): 'search' | 'rankings' | 'write' | null {
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

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname, searchParams } = request.nextUrl

  const rateLimitBucket = process.env.VERCEL_ENV === 'production'
    ? getApiBucket(pathname, request.method)
    : null

  if (rateLimitBucket) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (url && token) {
      try {
        const upstashRedis = await eval("import('@upstash/redis')")
          .catch(() => null) as unknown
        const upstashRatelimit = await eval("import('@upstash/ratelimit')")
          .catch(() => null) as unknown
        if (!upstashRedis || !upstashRatelimit) {
          console.warn('Upstash rate limiting deps missing; skipping')
          return supabaseResponse
        }

        const { Redis } = upstashRedis as { Redis: new (args: { url: string; token: string }) => unknown }
        const { Ratelimit } = upstashRatelimit as {
          Ratelimit: (new (args: { redis: unknown; limiter: unknown; prefix: string }) => {
            limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>
          }) & {
            slidingWindow: (tokens: number, window: string) => unknown
          }
        }

        const redis = new Redis({ url, token })
        const ip = getClientIp(request)

        let ratelimit: {
          limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>
        }

        if (rateLimitBucket === 'search') {
          ratelimit = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(60, '1 m'),
            prefix: 'rl:api:search',
          })
        } else if (rateLimitBucket === 'rankings') {
          ratelimit = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(120, '1 m'),
            prefix: 'rl:api:rankings',
          })
        } else {
          ratelimit = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(90, '1 m'),
            prefix: 'rl:api:write',
          })
        }

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
        console.warn('Upstash rate limiting unavailable:', error)
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
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    try {
      await supabase.auth.getUser()
    } catch (error) {
      console.error('[Proxy Auth Error]:', error)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
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
