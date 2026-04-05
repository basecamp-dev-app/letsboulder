import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import { reportError } from '@/lib/errors'

const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/map',
  '/logbook',
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

const PROTECTED_STATE_CHANGING_PREFIXES = [
  '/api/notifications',
  '/api/submissions',
  '/api/places',
  '/api/gym-admin',
  '/api/routes/submit',
  '/api/settings',
  '/api/profile',
  '/api/log-routes',
  '/api/flags',
  '/api/moderation',
  '/api/logs',
  '/api/crags/report',
  '/api/corrections',
]

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

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

function isAllowedRedirectPath(path: string): boolean {
  return ALLOWED_REDIRECT_PATHS.some((allowed) => {
    if (allowed.endsWith('/')) {
      return path.startsWith(allowed)
    }

    return path === allowed
  })
}

function shouldRefreshSupabaseSession(pathname: string, method: string): boolean {
  if (pathname.startsWith('/auth')) return true

  if (isStateChangingMethod(method)) {
    if (PROTECTED_STATE_CHANGING_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return true
    }

    if (pathname.match(/^\/api\/climbs\/[^/]+\/(flag|grade-vote|correction|verify)$/)) return true
    if (pathname.match(/^\/api\/images\/[^/]+\/(flag|flags)$/)) return true
    if (pathname.match(/^\/api\/routes\/[^/]+\/grades$/)) return true
    if (pathname.match(/^\/api\/comments\/[^/]+$/)) return true

    return false
  }

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

type ApplyProxyAuthParams = {
  request: NextRequest
  requestHeaders: Headers
  response: NextResponse
}

export async function applyProxyAuth({ request, requestHeaders, response }: ApplyProxyAuthParams): Promise<NextResponse> {
  let nextResponse = response
  const { pathname, searchParams } = request.nextUrl

  if (pathname === '/auth') {
    const redirectTo = searchParams.get('redirect_to')
    if (redirectTo && isAllowedRedirectPath(redirectTo)) {
      nextResponse.cookies.set('redirect_to', redirectTo, {
        path: '/',
        maxAge: 60 * 5,
        httpOnly: true,
      })
    }
  }

  if (!shouldRefreshSupabaseSession(pathname, request.method) || shouldSkipSessionRefreshForPrefetch(pathname, request)) {
    return nextResponse
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
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
          mergeResponseMetadata(nextResponse, updatedResponse)
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) => updatedResponse.cookies.set(name, value, options))
          nextResponse = updatedResponse
        },
      },
    }
  )

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) return nextResponse

    return nextResponse
  } catch (error) {
    reportError(error, { message: 'Proxy Auth Error' })
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
}
