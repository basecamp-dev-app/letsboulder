import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { Resend } from 'resend'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies

  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const rateLimitResult = rateLimit(request, 'strict', user.id)
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  const { email, firstName } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (email !== user.email) {
    return NextResponse.json({ error: 'Email does not match authenticated user' }, { status: 403 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('welcome_email_sent_at')
      .eq('email', email)
      .single()

    if (profileError || !profile) {
      console.error('Profile not found for email:', email)
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.welcome_email_sent_at) {
      return NextResponse.json({ success: true, message: 'Welcome email already sent' })
    }

    const greeting = firstName ? `Hi ${firstName}!` : 'Hi there!'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'letsboulder <noreply@letsboulder.com>',
      to: [email],
      subject: 'Welcome to letsboulder! 🧗',
      html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to letsboulder</title>
</head>
<body style="margin:0; padding:0; font-family: system-ui, sans-serif; background-color:#f4f4f5;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" max-width="480" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#18181b; padding: 24px 32px; text-align:center;">
              <span style="color:#ffffff; font-size:20px; font-weight:600; letter-spacing:-0.5px;">letsboulder</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h1 style="margin:0 0 24px; font-size:20px; font-weight:600; color:#18181b; letter-spacing:-0.3px;">${greeting}</h1>
              <p style="margin:0 0 24px; color:#52525b; line-height:1.6; font-size:15px;">
                Welcome to letsboulder! We started as a small community project and have grown into a community-driven platform for climbers everywhere.
              </p>
              <p style="margin:0 0 32px; color:#52525b; line-height:1.6; font-size:15px;">
                Whether you're here to track your progress, discover new routes, or contribute to our growing database, we're excited to have you join us.
              </p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f4f4f5; border-radius:8px; padding:20px;">
                    <p style="margin:0 0 8px; font-size:14px; font-weight:600; color:#18181b;">Upload Routes</p>
                    <p style="margin:0 0 12px; color:#52525b; line-height:1.5; font-size:13px;">
                      Share new climbs by uploading GPS-enabled photos. Your routes will be visible on the map after submission, and once they receive 3 community verifications, they'll be marked as verified.
                    </p>
                    <p style="margin:0; color:#52525b; line-height:1.5; font-size:13px;">
                      Head to <a href="${appUrl}/submit" style="color:#2563eb; text-decoration:underline;">${appUrl}/submit</a> to get started.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f4f4f5; border-radius:8px; padding:20px;">
                    <p style="margin:0 0 8px; font-size:14px; font-weight:600; color:#18181b;">Join Our Community</p>
                    <p style="margin:0 0 12px; color:#52525b; line-height:1.5; font-size:13px;">
                      Connect with fellow climbers, share your discoveries, and help grow the community.
                    </p>
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-radius:6px; background-color:#5865F2;">
                          <a href="https://discord.gg/vzAEMr2qrY" style="display:block; padding:12px 24px; color:#ffffff; text-decoration:none; font-weight:500; font-size:14px;">Join Discord</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:6px; background-color:#18181b;">
                    <a href="${appUrl}/map" style="display:block; padding:14px 28px; color:#ffffff; text-decoration:none; font-weight:500; font-size:15px;">Explore the Map</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0; color:#52525b; line-height:1.6; font-size:14px;">
                Happy climbing!<br>
                <span style="color:#71717a;">The letsboulder team</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5; padding:20px 32px; text-align:center; border-top:1px solid:#e4e4e7;">
              <p style="margin:0 0 8px; color:#71717a; font-size:12px;">
                <a href="${appUrl}/about" style="color:#71717a; text-decoration:underline;">About</a> &nbsp;|&nbsp; 
                <a href="${appUrl}/map" style="color:#71717a; text-decoration:underline;">Map</a> &nbsp;|&nbsp; 
                <a href="https://discord.gg/vzAEMr2qrY" style="color:#71717a; text-decoration:underline;">Discord</a>
              </p>
              <p style="margin:0; color:#a1a1aa; font-size:11px;">letsboulder - Built by climbers, for climbers</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    })

    await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('email', email)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Welcome email error:', error)
    return createErrorResponse(error, 'Welcome email error')
  }
}
