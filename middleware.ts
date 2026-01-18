import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/map',
  '/logbook',
  '/leaderboard',
  '/settings',
  '/submit',
  '/upload-climb',
  '/crag/',
  '/climb/',
  '/image/',
]

function isAllowedRedirectPath(path: string): boolean {
  return ALLOWED_REDIRECT_PATHS.some(allowed => {
    if (allowed.endsWith('/')) {
      return path.startsWith(allowed)
    }
    return path === allowed
  })
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/map', request.url), 301)
  }

  if (pathname === '/auth') {
    const redirectTo = searchParams.get('redirect_to')
    if (redirectTo && isAllowedRedirectPath(redirectTo)) {
      const response = NextResponse.next()
      response.cookies.set('redirect_to', redirectTo, {
        path: '/',
        maxAge: 60 * 5,
        httpOnly: true,
      })
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/auth',
  ],
}
