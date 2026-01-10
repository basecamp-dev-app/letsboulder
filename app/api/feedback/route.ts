import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const cookies = request.cookies

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

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message, isAnonymous } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    const submittedBy = user.email?.split('@')[0] || 'User'

    const workerUrl = process.env.WORKER_URL || 'https://email-moderation-production.patrickhadow.workers.dev'
    const workerApiKey = process.env.WORKER_API_KEY

    try {
      const workerResponse = await fetch(`${workerUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${workerApiKey}`
        },
        body: JSON.stringify({
          message: message.trim(),
          submittedBy,
          isAnonymous: isAnonymous === true
        })
      })

      const workerResult = await workerResponse.json()
      console.log('[Feedback] Worker response:', workerResult)

      if (!workerResponse.ok) {
        return NextResponse.json({ error: workerResult.error || 'Failed to send feedback' }, { status: 500 })
      }
    } catch (workerError) {
      console.error('[Feedback] Worker request failed:', workerError)
      return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Feedback sent!' })
  } catch (error) {
    console.error('Feedback error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Feedback endpoint',
    method: 'POST',
    required_fields: ['message'],
    optional_fields: ['isAnonymous']
  })
}
