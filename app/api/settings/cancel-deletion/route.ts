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
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }

    const { data: deletionRequest, error: fetchError } = await supabase
      .from('deletion_requests')
      .select('id, user_id, scheduled_at, cancelled_at, deleted_at')
      .eq('id', requestId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !deletionRequest) {
      return NextResponse.json({ error: 'Deletion request not found' }, { status: 404 })
    }

    if (deletionRequest.deleted_at) {
      return NextResponse.json({ error: 'Account has already been deleted' }, { status: 400 })
    }

    if (deletionRequest.cancelled_at) {
      return NextResponse.json({ error: 'Deletion request was already cancelled' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('deletion_requests')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error cancelling deletion request:', updateError)
      return NextResponse.json({ error: 'Failed to cancel deletion' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel deletion error:', error)
    return NextResponse.json({ error: 'Failed to cancel deletion' }, { status: 500 })
  }
}
