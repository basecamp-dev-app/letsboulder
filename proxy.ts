import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/map',
  '/logbook',
  '/rankings',
  '/settings',
  '/submit',
  '/upload-climb',
  '/crag/',
  '/climb/',
  '/image/',
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

function getApiBucket(pathname: string): string {
  if (
    pathname.startsWith('/api/crags/search') ||
    pathname.startsWith('/api/crags/nearby') ||
    pathname.startsWith('/api/regions/search') ||
    pathname.startsWith('/api/locations/search') ||
    pathname.startsWith('/api/images/search')
  ) {
    return 'search'
  }

  if (pathname.startsWith('/api/rankings')) return 'rankings'

  return 'default'
}

function isAllowedRedirectPath(path: string): boolean {
  return ALLOWED_REDIRECT_PATHS.some(allowed => {
    if (allowed.endsWith('/')) {
      return path.startsWith(allowed)
    }
    return path === allowed
  })
}

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname, searchParams } = request.nextUrl

  if (process.env.VERCEL_ENV === 'production' && pathname.startsWith('/api/')) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (url && token) {
      const redis = new Redis({ url, token })
      const bucket = getApiBucket(pathname)
      const ip = getClientIp(request)

      const ratelimit =
        bucket === 'search'
          ? new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(60, '1 m'),
              prefix: 'rl:api:search',
            })
          : bucket === 'rankings'
            ? new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(120, '1 m'),
                prefix: 'rl:api:rankings',
              })
            : new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(300, '1 m'),
                prefix: 'rl:api:default',
              })

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
    }
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/map', request.url), 301)
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

  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
