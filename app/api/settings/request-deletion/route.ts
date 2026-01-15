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

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existingRequest = await supabase
      .from('deletion_requests')
      .select('id, scheduled_at, cancelled_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (existingRequest.data && !existingRequest.data.cancelled_at) {
      const scheduledDate = new Date(existingRequest.data.scheduled_at)
      const now = new Date()
      const hoursRemaining = Math.max(0, Math.ceil((scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60)))

      return NextResponse.json({
        error: 'Deletion already scheduled',
        scheduled_at: existingRequest.data.scheduled_at,
        hours_remaining: hoursRemaining,
      }, { status: 400 })
    }

    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { data: deletionRequest, error } = await supabase
      .from('deletion_requests')
      .insert({
        user_id: user.id,
        scheduled_at: scheduledAt,
        delete_route_uploads: false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating deletion request:', error)
      return NextResponse.json({ error: 'Failed to create deletion request' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000'
    const redirectUrl = `${baseUrl}/settings/confirm-deletion?request_id=${deletionRequest.id}`

    const { error: emailError } = await supabase.auth.resetPasswordForEmail(user.email!, {
      redirectTo: redirectUrl,
    })

    if (emailError) {
      console.error('Error sending verification email:', emailError)
      await supabase.from('deletion_requests').delete().eq('id', deletionRequest.id)
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      request_id: deletionRequest.id,
      scheduled_at: scheduledAt,
    })
  } catch (error) {
    console.error('Request deletion error:', error)
    return NextResponse.json({ error: 'Failed to request deletion' }, { status: 500 })
  }
}
