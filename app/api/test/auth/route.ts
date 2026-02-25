import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

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
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      }
    )

    const userData = await userResponse.json()

    if (!userResponse.ok || !userData.email) {
      return NextResponse.json(
        { error: 'User not found', details: userData },
        { status: 500 }
      )
    }

    const accessToken = jwt.sign(
      {
        sub: userId,
        email: userData.email,
        aud: 'authenticated',
        role: 'authenticated',
        iss: `${supabaseUrl}/auth/v1`,
      },
      serviceRoleKey,
      { expiresIn: '1h' }
    )

    const refreshToken = randomUUID()

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: userData.email,
      },
    })

    const isProd = process.env.NODE_ENV === 'production'
    const expiresIn = 3600

    response.cookies.set('sb-access-token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: expiresIn,
      path: '/',
    })

    response.cookies.set('sb-refresh-token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Test auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
