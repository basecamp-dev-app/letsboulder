import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SignJWT } from 'jose'
import { Resend } from 'resend'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

const DELETE_TOKEN_SECRET = new TextEncoder().encode(
  process.env.DELETE_ACCOUNT_SECRET || 'default-dev-secret-change-in-production'
)
const DELETE_TOKEN_EXPIRY = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const deleteRouteUploads = searchParams.get('delete_route_uploads') === 'true'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'sensitive', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      action: 'delete-account',
      deleteRouteUploads,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + DELETE_TOKEN_EXPIRY) / 1000))
      .sign(DELETE_TOKEN_SECRET)

    const deleteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings/delete-confirm?token=${token}`

    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'gsyrocks <noreply@gsyrocks.com>',
      to: [user.email],
      subject: 'Confirm Account Deletion - gsyrocks',
      html: `
        <h2>Confirm Account Deletion</h2>
        <p>You requested to delete your gsyrocks account. This action cannot be undone.</p>
        <p>Click the link below to confirm deletion. This link will expire in 10 minutes.</p>
        <p><a href="${deleteUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Delete My Account</a></p>
        <p>If you didn't request this deletion, please ignore this email.</p>
      `,
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Initiate delete error:', error)
    return NextResponse.json({ error: 'Failed to initiate deletion' }, { status: 500 })
  }
}
