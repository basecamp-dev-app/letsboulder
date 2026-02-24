import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const isDev = hostname?.includes('dev.')
  
  if (!isDev) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const apiKey = request.headers.get('x-test-api-key')
  const email = request.nextUrl.searchParams.get('email')

  if (!apiKey || !email) {
    return NextResponse.json({ error: 'Missing api_key or email' }, { status: 400 })
  }

  if (apiKey?.trim() !== process.env.TEST_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const { data: userData, error: getUserError } = await (supabaseAdmin.auth.admin as any).getUserByEmail(email)

    if (getUserError || !userData?.user) {
      return NextResponse.json({ error: 'User not found', details: getUserError?.message }, { status: 404 })
    }

    const { data: sessionData, error: createSessionError } = await (supabaseAdmin.auth.admin as any).createSession(userData.user.id)

    if (createSessionError || !sessionData) {
      return NextResponse.json({ error: 'Failed to create session', details: createSessionError?.message }, { status: 500 })
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
      },
    })

    if (sessionData.session) {
      const isProd = process.env.NODE_ENV === 'production'
      response.cookies.set('sb-access-token', sessionData.session.access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: sessionData.session.expires_in,
        path: '/',
      })

      response.cookies.set('sb-refresh-token', sessionData.session.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })
    }

    return response
  } catch (error) {
    console.error('Test auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
