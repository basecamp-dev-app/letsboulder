import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    let query = supabase
      .from('climb_flags')
      .select(`
        id,
        flag_type,
        comment,
        status,
        action_taken,
        resolved_by,
        resolved_at,
        created_at,
        flagger:flagger_id(id, email, username),
        image:image_id(id, url),
        crag:crag_id(id, name),
        climbs:climb_id(id, name, grade)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: flags, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching flags')
    }

    const { count } = await supabase
      .from('climb_flags')
      .select('*', { count: 'exact', head: true })
      .eq('status', status !== 'all' ? status : 'pending')

    return NextResponse.json({
      flags: flags || [],
      count: count || 0,
    })
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}
