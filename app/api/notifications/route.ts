import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const unreadOnly = searchParams.get('unread_only') === 'true'
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  const cookies = request.cookies

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching notifications')
    }

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    return NextResponse.json({ 
      notifications: data || [],
      unread_count: count || 0,
    })
  } catch (error) {
    return createErrorResponse(error, 'Notifications fetch error')
  }
}

export async function POST(request: NextRequest) {
  const cookies = request.cookies

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const body = await request.json()
    const { user_id, type, title, message, link } = body

    if (!user_id || !type || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id,
        type,
        title,
        message,
        link,
      })

    if (error) {
      return createErrorResponse(error, 'Error creating notification')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Notification create error')
  }
}
