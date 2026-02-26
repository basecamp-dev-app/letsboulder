import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const host = hostname.split(':')[0].toLowerCase()
  const isDev = host.startsWith('dev.')
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  const allowAnyHost = process.env.ENABLE_TEST_AUTH_ENDPOINT === 'true'
  
  if (!isDev && !isLocal && !allowAnyHost) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const apiKey = request.nextUrl.searchParams.get('api_key')
  const userId = request.nextUrl.searchParams.get('user_id')
  const expectedApiKey = process.env.TEST_API_KEY?.trim()
  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()

  if (!apiKey || !userId) {
    return NextResponse.json({ error: 'Missing api_key or user_id' }, { status: 400 })
  }

  if (!expectedApiKey) {
    return NextResponse.json({ error: 'Test auth not configured on server' }, { status: 500 })
  }

  if (!testUserPassword) {
    return NextResponse.json({ error: 'TEST_USER_PASSWORD is required on server' }, { status: 500 })
  }

  if (apiKey.trim() !== expectedApiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceRoleKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!anonKey || !serviceRoleKey) {
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

    const updateUserResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: testUserPassword,
          email_confirm: true,
        }),
      }
    )

    const updateUserData = await updateUserResponse.json()

    if (!updateUserResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to prepare test user', details: updateUserData },
        { status: 500 }
      )
    }

    const tokenResponse = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          password: testUserPassword,
        }),
      }
    )

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      return NextResponse.json(
        { error: 'Failed to create auth session', details: tokenData },
        { status: 500 }
      )
    }

    const cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []

    const supabase = createServerClient(
      supabaseUrl,
      anonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(newCookies) {
            newCookies.forEach((cookie) => cookiesToSet.push(cookie))
          },
        },
      }
    )

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })

    if (sessionError) {
      return NextResponse.json(
        { error: 'Failed to persist auth session', details: sessionError.message },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: userData.email,
      },
    })

    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (error) {
    console.error('Test auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
