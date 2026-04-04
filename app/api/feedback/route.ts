import { NextRequest, NextResponse } from 'next/server'
import { notifyFeedback } from '@/lib/discord'
import { reportError } from '@/lib/errors'
import { createServerClient } from '@supabase/ssr'
import { serverEnv } from '@/lib/env'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, url } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const sanitizedMessage = message.slice(0, 2000)
    const sanitizedUrl = url?.slice(0, 500) || 'Unknown'

    const supabase = createServerClient(
      serverEnv.NEXT_PUBLIC_SUPABASE_URL,
      serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    const userEmail = user?.email

    let userName: string | undefined
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single()

      if (profile) {
        const nameParts = [profile.first_name, profile.last_name].filter(Boolean)
        if (nameParts.length > 0) {
          userName = nameParts.join(' ')
        }
      }
    }

    await notifyFeedback(sanitizedMessage, userId, sanitizedUrl, userName, userEmail)

    return NextResponse.json({ success: true })
  } catch (error) {
    reportError(error, { message: 'Feedback API error' })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
