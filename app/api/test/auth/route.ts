import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/errors'
import jwt from 'jsonwebtoken'

export async function POST(request: NextRequest) {
  if (process.env.ENABLE_TEST_AUTH_ENDPOINT !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const internalTestKey = request.headers.get('x-internal-test-key')
  const expectedInternalTestKey = process.env.INTERNAL_TEST_KEY?.trim()

  if (!expectedInternalTestKey || internalTestKey?.trim() !== expectedInternalTestKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const bodyPayload = body as Record<string, unknown> | null
  const apiKey = typeof bodyPayload?.api_key === 'string' ? bodyPayload.api_key : null
  const userId = typeof bodyPayload?.user_id === 'string' ? bodyPayload.user_id : null
  const emailParam = typeof bodyPayload?.email === 'string' ? bodyPayload.email : null
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
  const serviceRoleKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Test auth requires service role key' }, { status: 500 })
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    let resolvedUserId = userId?.trim() || null
    let resolvedEmail = emailParam?.trim().toLowerCase() || null

    if (resolvedUserId && !resolvedEmail) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(resolvedUserId)
      if (!userError && userData?.user?.email) {
        resolvedEmail = userData.user.email?.trim().toLowerCase() || null
      }
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: 'Failed to resolve test user email' }, { status: 500 })
    }

    const targetUserId = resolvedUserId
    const targetEmail = resolvedEmail

    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (!listError && listData.users) {
      const existingUser = listData.users.find(
        (u) => u.email?.toLowerCase() === resolvedEmail?.toLowerCase()
      )
      if (existingUser) {
        resolvedUserId = existingUser.id
        resolvedEmail = existingUser.email || resolvedEmail
      }
    }

    if (!resolvedUserId) {
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: resolvedEmail,
        password: testUserPassword,
        email_confirm: true,
      })

      if (createError || !createdUser.user) {
        reportError(new Error('Test auth user create failed'), { extra: { error: createError?.message } })
        return NextResponse.json({ error: 'Failed to create test user' }, { status: 500 })
      }

      resolvedUserId = createdUser.user.id
      resolvedEmail = createdUser.user.email || resolvedEmail
    }

    const expiresIn = 3600
    const payload = {
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + expiresIn,
      sub: resolvedUserId,
      email: resolvedEmail,
      role: 'authenticated',
    }

    const accessToken = jwt.sign(payload, serviceRoleKey, { algorithm: 'HS256' })
    const refreshToken = jwt.sign(payload, serviceRoleKey, { algorithm: 'HS256' })

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

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (setSessionError) {
      reportError(new Error('Test auth session persist failed'), { extra: { error: setSessionError.message } })
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
