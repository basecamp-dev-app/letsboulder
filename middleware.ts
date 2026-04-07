import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && request.nextUrl.pathname.startsWith('/api/test/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/test/:path*',
}
