import { NextResponse, type NextRequest } from 'next/server'
import { applyProxyAuth } from '@/lib/proxy-auth'
import { applyProxyRateLimit } from '@/lib/proxy-rate-limit'

const CSRF_COOKIE_NAME = 'csrf_token'

const LOCATION_DETECT_MAX_BODY_BYTES = 2 * 1024

function isStateChangingMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

function shouldSkipMiddleware(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod !== 'GET') return false

  const publicReadOnlyPrefixes = [
    '/api/csrf',
    '/api/regions',
    '/api/rankings',
    '/api/places/search',
    '/api/places/nearby',
    '/api/moderation/queue',
    '/api/offline-packs',
    '/api/media/private',
    '/api/media/upload-sessions',
    '/api/locations/search',
    '/api/locations/reverse',
    '/api/logbook/contributions',
    '/api/flags',
    '/api/location-tags',
    '/api/gear',
    '/api/gym-admin/gyms',
    '/api/images/search',
    '/api/crags/search',
    '/api/crags/pins',
    '/api/crags/nearby',
    '/api/community',
    '/api/uploads/signed-url',
    '/api/uploads/signed-urls',
    '/api/crags/',
    '/api/climbs/',
    '/api/admin/gyms/',
    '/api/submissions/drafts/collaborate',
    '/api/submissions/collaborate',
    '/api/routes/',
    '/api/profile',
    '/api/notifications',
    '/api/comments',
    '/api/media/',
  ]

  return publicReadOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))
}

function shouldRequireCsrf(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (!isStateChangingMethod(normalizedMethod)) return false
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

  if (shouldSkipMiddleware(pathname, request.method)) {
    return response
  }

  if (shouldRequireCsrf(pathname, request.method)) {
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
    '/api/:path*',
    '/auth/:path*',
    '/settings/:path*',
    '/submit/:path*',
    '/admin/:path*',
    '/gym-admin/:path*',
    '/logbook/:path*',
  ],
}
