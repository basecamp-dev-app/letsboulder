import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { Resend } from 'resend'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { buildDeleteAccountEmail } from '@/lib/email/delete-account-email'
import { serverEnv } from '@/lib/env'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

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

const initiateDeleteQuerySchema = z.object({
  delete_route_uploads: z.enum(['true', 'false']).optional(),
})

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const parsedQuery = parseWithSchema(
    initiateDeleteQuerySchema,
    Object.fromEntries(new URL(request.url).searchParams.entries())
  )
  if (!parsedQuery.success) return parsedQuery.response

  const deleteRouteUploads = parsedQuery.data.delete_route_uploads === 'true'

  const { supabase, userId } = middlewareResult

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
