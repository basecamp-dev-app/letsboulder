import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import { reportError } from '@/lib/errors'
import { getSafeRedirect } from '@/lib/safe-redirect'

const SESSION_REFRESH_PREFIXES = [
  '/settings',
  '/admin',
  '/gym-admin',
  '/auth',
]

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

function shouldRefreshSupabaseSession(pathname: string, method: string): boolean {
  if (pathname.startsWith('/auth')) return true

  if (isStateChangingMethod(method) && pathname.startsWith('/api/')) {
    return true
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

type ApplyProxyAuthParams = {
  request: NextRequest
  requestHeaders: Headers
  response: NextResponse
}

export async function applyProxyAuth({ request, requestHeaders, response }: ApplyProxyAuthParams): Promise<NextResponse> {
  let nextResponse = response
  const { pathname, searchParams } = request.nextUrl

  if (pathname === '/auth') {
    const redirectTo = getSafeRedirect(searchParams.get('redirect_to'), '')
    if (redirectTo) {
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
