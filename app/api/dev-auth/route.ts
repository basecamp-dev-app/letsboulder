import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse, sanitizeError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  if (process.env.DEV_PASSWORD_AUTH !== 'true') {
    return NextResponse.json({ error: 'Dev auth disabled' }, { status: 403 })
  }

  const rateLimitResult = rateLimit(request, 'strict')
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  const devEmail = process.env.DEV_USER_EMAIL
  const devPassword = process.env.DEV_USER_PASSWORD

  if (!devEmail || !devPassword) {
    sanitizeError(new Error('Dev credentials not configured'), 'Dev credentials not configured')
    return NextResponse.json({ error: 'Dev auth misconfigured' }, { status: 500 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll() { return request.cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: existingUser } = await supabase.auth.signInWithPassword({
      email: devEmail,
      password: devPassword,
    })

    if (existingUser.user) {
      const url = new URL('/', request.nextUrl.origin)
      return NextResponse.redirect(url)
    }
  } catch (signInError: unknown) {
    if (signInError instanceof Error && signInError.message !== 'Invalid login credentials') {
      sanitizeError(signInError, 'Dev signin error')
      return createErrorResponse(signInError, 'Dev signin error')
    }
  }

  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: devEmail,
      password: devPassword,
    })

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: devEmail,
          password: devPassword,
        })
        if (reauthError) {
          return NextResponse.json(
            { error: 'Dev user exists but password differs' },
            { status: 400 }
          )
        }
        const url = new URL('/', request.nextUrl.origin)
        return NextResponse.redirect(url)
      }
      return createErrorResponse(signUpError, 'Dev signup error')
    }

    if (signUpData.user) {
      const url = new URL('/', request.nextUrl.origin)
      return NextResponse.redirect(url)
    }
  } catch (err: unknown) {
    sanitizeError(err, 'Dev signup error')
    return createErrorResponse(err, 'Dev signup error')
  }

  return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
}
