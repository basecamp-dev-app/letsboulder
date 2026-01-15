import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const requestId = searchParams.get('request_id')

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

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const { delete_route_uploads, primary_reason } = await request.json()

    const { data: deletionRequest, error: fetchError } = await supabase
      .from('deletion_requests')
      .select('id, user_id, scheduled_at, cancelled_at')
      .eq('id', requestId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !deletionRequest) {
      return NextResponse.json({ error: 'Deletion request not found' }, { status: 404 })
    }

    if (deletionRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (deletionRequest.cancelled_at) {
      return NextResponse.json({ error: 'Deletion request was cancelled' }, { status: 400 })
    }

    const now = new Date()
    const scheduledDate = new Date(deletionRequest.scheduled_at)

    if (now > scheduledDate) {
      return NextResponse.json({ error: 'Deletion window has expired' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('deletion_requests')
      .update({
        delete_route_uploads: delete_route_uploads === true,
        primary_reason: primary_reason,
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating deletion request:', updateError)
      return NextResponse.json({ error: 'Failed to confirm deletion' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      scheduled_at: deletionRequest.scheduled_at,
    })
  } catch (error) {
    console.error('Confirm deletion error:', error)
    return NextResponse.json({ error: 'Failed to confirm deletion' }, { status: 500 })
  }
}
