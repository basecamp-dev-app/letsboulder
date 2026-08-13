import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ segment: string }> },
) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { segment } = await params
  const expectedSegment = process.env.TEST_AUTH_PATH_SEGMENT?.trim()

  if (!expectedSegment || segment !== expectedSegment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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

  const testUserPassword = process.env.TEST_USER_PASSWORD?.trim()

  if (!testUserPassword) {
    return NextResponse.json({ error: 'TEST_USER_PASSWORD is required on server' }, { status: 500 })
  }

  if (apiKey.trim() !== expectedApiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const serviceRoleKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Test auth requires service role key' }, { status: 500 })
  }

  const resolvedUserId = userId?.trim() || null
  let resolvedEmail = emailParam?.trim().toLowerCase() || null

  if (!resolvedUserId && !resolvedEmail) {
    return NextResponse.json({ error: 'Missing user_id or email' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Test auth requires Supabase public configuration' }, { status: 500 })
  }

  if (!resolvedEmail && resolvedUserId) {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await admin.auth.admin.getUserById(resolvedUserId)
    if (error || !data.user?.email) return NextResponse.json({ error: 'Test user not found' }, { status: 401 })
    resolvedEmail = data.user.email.toLowerCase()
  }
  if (!resolvedEmail) return NextResponse.json({ error: 'Test user email is required' }, { status: 401 })

  const response = NextResponse.json({ success: true })
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: { secure: request.nextUrl.protocol === 'https:' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options)
      },
    },
  })
  const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password: testUserPassword,
  })
  if (sessionError || !sessionData.user || (resolvedUserId && sessionData.user.id !== resolvedUserId)) {
    return NextResponse.json({ error: 'Test user authentication failed' }, { status: 401 })
  }

  return NextResponse.json({ success: true, user: { id: sessionData.user.id, email: sessionData.user.email } }, { headers: response.headers })
}
