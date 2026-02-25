import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const isDev = hostname?.includes('dev.')
  
  if (!isDev) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const apiKey = request.nextUrl.searchParams.get('api_key')
  const userId = request.nextUrl.searchParams.get('user_id')

  if (!apiKey || !userId) {
    return NextResponse.json({ error: 'Missing api_key or user_id' }, { status: 400 })
  }

  if (apiKey?.trim() !== process.env.TEST_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}/sessions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const sessionData = await response.json()

    if (!response.ok || !sessionData) {
      return NextResponse.json(
        { error: 'Failed to create session', details: sessionData },
        { status: 500 }
      )
    }

    const res = NextResponse.json({
      success: true,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
      },
    })

    if (sessionData.session) {
      const isProd = process.env.NODE_ENV === 'production'
      res.cookies.set('sb-access-token', sessionData.session.access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: sessionData.session.expires_in,
        path: '/',
      })

      res.cookies.set('sb-refresh-token', sessionData.session.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })
    }

    return res
  } catch (error) {
    console.error('Test auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
