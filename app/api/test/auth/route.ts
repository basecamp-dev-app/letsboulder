import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

export async function GET(request: NextRequest) {
  const hostHeader = request.headers.get('host') || request.nextUrl.host
  const host = hostHeader.split(':')[0].toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1'

  if (!isLocal) {
    const internalTestKey = request.headers.get('x-internal-test-key')
    const expectedInternalTestKey = process.env.INTERNAL_TEST_KEY?.trim()

    if (!expectedInternalTestKey || internalTestKey?.trim() !== expectedInternalTestKey) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const apiKey = request.nextUrl.searchParams.get('api_key')
  const userId = request.nextUrl.searchParams.get('user_id')
  const testAuthHeader = request.headers.get('x-test-auth')
  const expectedApiKey = process.env.TEST_API_KEY?.trim()
  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()

  if (!apiKey || !userId) {
    return NextResponse.json({ error: 'Missing api_key or user_id' }, { status: 400 })
  }

  if (testAuthHeader !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

    const userData = await parseJsonSafe(userResponse) as { email?: string }

    if (!userResponse.ok || !userData.email) {
      console.error('Test auth user lookup failed', {
        status: userResponse.status,
        userId,
        payload: userData,
      })
      return NextResponse.json(
        { error: 'User not found' },
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

    const updateUserData = await parseJsonSafe(updateUserResponse)

    if (!updateUserResponse.ok) {
      console.error('Test auth user update failed', {
        status: updateUserResponse.status,
        userId,
        payload: updateUserData,
      })
      return NextResponse.json(
        { error: 'Failed to prepare test user' },
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

    const tokenData = await parseJsonSafe(tokenResponse) as { access_token?: string; refresh_token?: string }

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      console.error('Test auth token exchange failed', {
        status: tokenResponse.status,
        userId,
        payload: tokenData,
      })
      return NextResponse.json(
        { error: 'Failed to create auth session' },
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
      console.error('Test auth session persist failed', {
        userId,
        error: sessionError.message,
      })
      return NextResponse.json(
        { error: 'Failed to persist auth session' },
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
