import { NextRequest, NextResponse } from 'next/server'
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

  if (!apiKey || (!userId && !emailParam)) {
    return NextResponse.json({ error: 'Missing api_key and test identity' }, { status: 400 })
  }

  if (testAuthHeader !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!expectedApiKey) {
    return NextResponse.json({ error: 'Test auth not configured on server' }, { status: 500 })
  }

  if (apiKey.trim() !== expectedApiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const serviceRoleKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Test auth requires service role key' }, { status: 500 })
  }

  const resolvedUserId = userId?.trim() || null
  const resolvedEmail = emailParam?.trim().toLowerCase() || null

  if (!resolvedUserId && !resolvedEmail) {
    return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 })
  }

  const expiresIn = 3600
  const payload = {
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    sub: resolvedUserId,
    email: resolvedEmail,
    role: 'authenticated',
    email_confirmed_at: new Date().toISOString(),
  }

  const accessToken = jwt.sign(payload, serviceRoleKey, { algorithm: 'HS256' })
  const refreshToken = jwt.sign(payload, serviceRoleKey, { algorithm: 'HS256' })

  const response = NextResponse.json({
    success: true,
    user: {
      id: resolvedUserId,
      email: resolvedEmail,
    },
  })

  response.cookies.set('sb-access-token', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: expiresIn,
    path: '/',
  })

  response.cookies.set('sb-refresh-token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: expiresIn * 7,
    path: '/',
  })

  return response
}
