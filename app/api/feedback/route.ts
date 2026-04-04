import { NextRequest, NextResponse } from 'next/server'
import { notifyFeedback } from '@/lib/discord'
import { reportError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'strict',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const body = await request.json()
    const { message, url } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const sanitizedMessage = message.slice(0, 2000)
    const sanitizedUrl = url?.slice(0, 500) || 'Unknown'

    let userName: string | undefined
    let userEmail: string | undefined
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single()

      if (profile) {
        const nameParts = [profile.first_name, profile.last_name].filter(Boolean)
        if (nameParts.length > 0) {
          userName = nameParts.join(' ')
        }
        userEmail = profile.email ?? undefined
      }
    }

    await notifyFeedback(sanitizedMessage, userId ?? undefined, sanitizedUrl, userName, userEmail)

    return NextResponse.json({ success: true })
  } catch (error) {
    reportError(error, { message: 'Feedback API error' })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
