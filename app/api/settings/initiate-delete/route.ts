import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SignJWT } from 'jose'
import { Resend } from 'resend'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { buildDeleteAccountEmail } from '@/lib/email/delete-account-email'
import { serverEnv } from '@/lib/env'

function getDeleteTokenSecret(): Uint8Array {
  const secret = serverEnv.DELETE_ACCOUNT_SECRET

  if (secret) {
    return new TextEncoder().encode(secret)
  }

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return new TextEncoder().encode('dev-only-delete-secret')
  }

  throw new Error('DELETE_ACCOUNT_SECRET is required in non-development environments')
}

const DELETE_TOKEN_EXPIRY = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const deleteRouteUploads = searchParams.get('delete_route_uploads') === 'true'

  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'sensitive', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const deleteTokenSecret = getDeleteTokenSecret()

    const token = await new SignJWT({
      userId,
      email: user.email,
      action: 'delete-account',
      deleteRouteUploads,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + DELETE_TOKEN_EXPIRY) / 1000))
      .sign(deleteTokenSecret)

    const deleteUrl = `${serverEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings/delete-confirm?token=${token}`
    const deleteAccountEmail = buildDeleteAccountEmail({ deleteUrl })

    const resend = new Resend(serverEnv.RESEND_API_KEY)

    await resend.emails.send({
      from: 'letsboulder <noreply@letsboulder.com>',
      to: [user.email],
      subject: deleteAccountEmail.subject,
      html: deleteAccountEmail.html,
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    return createErrorResponse(error, 'Initiate delete error')
  }
}
