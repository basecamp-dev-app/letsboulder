import { NextRequest, NextResponse } from 'next/server'
import { notifyFeedback } from '@/lib/discord'
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

    await notifyFeedback(sanitizedMessage, userId, sanitizedUrl)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Feedback API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
