import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { climbIds, status = 'top' } = body

    if (!climbIds || !Array.isArray(climbIds) || climbIds.length === 0) {
      return NextResponse.json({ error: 'climbIds array is required' }, { status: 400 })
    }

    const validStatuses = ['flash', 'top', 'try']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const logs = climbIds.map(climbId => ({
      user_id: user.id,
      climb_id: climbId,
      status,
      created_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('logs')
      .upsert(logs, { onConflict: 'user_id,climb_id' })

    if (error) {
      console.error('Failed to log climbs:', error)
      return NextResponse.json({ error: 'Failed to log climbs' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      logged: climbIds.length,
      status
    })

  } catch (error) {
    console.error('Log routes error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
