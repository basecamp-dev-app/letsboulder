import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { reportError } from '@/lib/errors'

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
  const emailParam = request.nextUrl.searchParams.get('email')
  const testAuthHeader = request.headers.get('x-test-auth')
  const expectedApiKey = process.env.TEST_API_KEY?.trim()
  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()

  if (!apiKey || (!userId && !emailParam)) {
    return NextResponse.json({ error: 'Missing api_key and test identity' }, { status: 400 })
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
    let resolvedUserId = userId?.trim() || null
    let resolvedEmail = emailParam?.trim().toLowerCase() || null

    if (!resolvedEmail && resolvedUserId) {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${resolvedUserId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      })

      const userData = await parseJsonSafe(userResponse) as { email?: string }
      if (userResponse.ok && userData.email) {
        resolvedEmail = userData.email.trim().toLowerCase()
      }
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: 'Failed to resolve test user email' }, { status: 500 })
    }

    let page = 1
    let foundUser: { id: string; email?: string } | null = null

    while (!foundUser) {
      const listUsersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      })

      const listUsersData = await parseJsonSafe(listUsersResponse) as { users?: Array<{ id: string; email?: string }> }
      const users = Array.isArray(listUsersData.users) ? listUsersData.users : []

      if (!listUsersResponse.ok) {
        reportError(new Error('Test auth user list failed'), { extra: { status: listUsersResponse.status, email: resolvedEmail, payload: listUsersData } })
        return NextResponse.json({ error: 'Failed to list test users' }, { status: 500 })
      }

      foundUser = users.find((candidate) => candidate.email?.trim().toLowerCase() === resolvedEmail) || null
      if (foundUser || users.length < 200) break
      page += 1
    }

    if (!foundUser && resolvedUserId) {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${resolvedUserId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      })
      const userData = await parseJsonSafe(userResponse) as { id?: string; email?: string }

      if (userResponse.ok && userData.id && userData.email?.trim().toLowerCase() === resolvedEmail) {
        foundUser = { id: userData.id, email: userData.email }
      }
    }

    if (!foundUser) {
      const createUserResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resolvedEmail,
          password: testUserPassword,
          email_confirm: true,
        }),
      })

      const createUserData = await parseJsonSafe(createUserResponse) as { id?: string; user?: { id?: string; email?: string }; email?: string }
      const createdUserId = createUserData.user?.id || createUserData.id
      const createdUserEmail = createUserData.user?.email || createUserData.email || resolvedEmail

      if (!createUserResponse.ok || !createdUserId) {
        reportError(new Error('Test auth user create failed'), { extra: { status: createUserResponse.status, email: resolvedEmail, payload: createUserData } })
        return NextResponse.json({ error: 'Failed to create test user' }, { status: 500 })
      }

      foundUser = { id: createdUserId, email: createdUserEmail }
    }

    resolvedUserId = foundUser.id
    resolvedEmail = foundUser.email?.trim().toLowerCase() || resolvedEmail

    const updateUserResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${resolvedUserId}`,
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
      reportError(new Error('Test auth user update failed'), { extra: { status: updateUserResponse.status, userId: resolvedUserId, payload: updateUserData } })
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
          email: resolvedEmail,
          password: testUserPassword,
        }),
      }
    )

    const tokenData = await parseJsonSafe(tokenResponse) as { access_token?: string; refresh_token?: string }

    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      reportError(new Error('Test auth token exchange failed'), { extra: { status: tokenResponse.status, userId: resolvedUserId, payload: tokenData } })
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
      reportError(new Error('Test auth session persist failed'), { extra: { userId: resolvedUserId, error: sessionError.message } })
      return NextResponse.json(
        { error: 'Failed to persist auth session' },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: resolvedUserId,
        email: resolvedEmail,
      },
    })

    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options)
    })

    return response
  } catch (error) {
    reportError(error, { message: 'Test auth error' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
