import { NextResponse, type NextRequest } from 'next/server'
import { applyProxyAuth } from '@/lib/proxy-auth'
import { applyProxyRateLimit } from '@/lib/proxy-rate-limit'

const CSRF_COOKIE_NAME = 'csrf_token'

const LOCATION_DETECT_MAX_BODY_BYTES = 2 * 1024

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
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
  requestHeaders.delete('x-internal-user-id')

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const { pathname } = request.nextUrl

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

  const rateLimitResponse = await applyProxyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  return applyProxyAuth({ request, requestHeaders, response })
}

export const config = {
  matcher: [
    '/api/locations/detect',
    '/auth/:path*',
    '/settings/:path*',
    '/submit/:path*',
    '/admin/:path*',
    '/gym-admin/:path*',
    '/logbook/:path*',
    '/api/notifications/:path*',
    '/api/submissions/:path*',
    '/api/places',
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
    '/api/comments/(.*)',
    '/api/routes/(.*)/grades',
    '/api/corrections/(.*)/vote',
  ],
}
