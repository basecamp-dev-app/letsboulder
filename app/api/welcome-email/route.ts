import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { createErrorResponse, reportError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { buildWelcomeEmail } from '@/lib/email/welcome-email'
import { getAdminClient } from '@/lib/supabase-server'
import { serverEnv } from '@/lib/env.server'
import { parseWithSchema } from '@/lib/api-validation'

const welcomeEmailSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  firstName: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase: authClient } = middlewareResult

  const { data: { user } } = await authClient.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const rateLimitResult = await rateLimit(request, 'strict', user.id)
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  const parsedBody = parseWithSchema(welcomeEmailSchema, await request.json())
  if (!parsedBody.success) return parsedBody.response

  const { email, firstName } = parsedBody.data

  if (email !== user.email) {
    return NextResponse.json({ error: 'Email does not match authenticated user' }, { status: 403 })
  }

  const supabase = getAdminClient()

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('welcome_email_sent_at')
      .eq('email', email)
      .single()

    if (profileError || !profile) {
      reportError(new Error('Profile not found for email'), { message: 'Profile not found for email', extra: { email } })
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.welcome_email_sent_at) {
      return NextResponse.json({ success: true, message: 'Welcome email already sent' })
    }

    const appUrl = serverEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resendApiKey = serverEnv.RESEND_API_KEY
    const welcomeEmail = buildWelcomeEmail({ appUrl, firstName: firstName ?? null })

    if (!resendApiKey) {
      console.warn('RESEND_API_KEY missing, returning mock welcome email response')
      return NextResponse.json({ success: true, id: 'mock_id' })
    }

    const resend = new Resend(resendApiKey)

    await resend.emails.send({
      from: 'letsboulder <noreply@letsboulder.com>',
      to: [email],
      subject: welcomeEmail.subject,
      html: welcomeEmail.html,
    })

    await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('email', email)

    return NextResponse.json({ success: true })

  } catch (error) {
    reportError(error, { message: 'Welcome email error' })
    return createErrorResponse(error, 'Welcome email error')
  }
}
