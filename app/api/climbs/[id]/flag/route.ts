import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewFlag } from '@/lib/discord'

const VALID_FLAG_TYPES = ['location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: climbId } = await params

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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!climbId) {
      return NextResponse.json({ error: 'Climb ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { flag_type, comment } = body

    if (!flag_type || !VALID_FLAG_TYPES.includes(flag_type)) {
      return NextResponse.json({
        error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`
      }, { status: 400 })
    }

    if (!comment || comment.trim().length < 10) {
      return NextResponse.json({ error: 'Comment must be at least 10 characters' }, { status: 400 })
    }

    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select(`
        id,
        name,
        grade,
        crag_id,
        user_id,
        deleted_at,
        crag:crag_id(id, name)
      `)
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json({ error: 'Climb not found' }, { status: 404 })
    }

    if (climb.deleted_at) {
      return NextResponse.json({ error: 'This climb has already been removed' }, { status: 400 })
    }

    const { data: existingFlag } = await supabase
      .from('climb_flags')
      .select('id, status')
      .eq('climb_id', climbId)
      .eq('flagger_id', user.id)
      .eq('status', 'pending')
      .single()

    if (existingFlag) {
      return NextResponse.json({ error: 'You have already flagged this climb. It is being reviewed.' }, { status: 400 })
    }

    const { data: flag, error: flagError } = await supabase
      .from('climb_flags')
      .insert({
        climb_id: climbId,
        crag_id: climb.crag_id,
        flagger_id: user.id,
        flag_type,
        comment: comment.trim(),
        status: 'pending',
      })
      .select()
      .single()

    if (flagError) {
      return createErrorResponse(flagError, 'Error creating flag')
    }

    const cragName = Array.isArray(climb.crag) ? climb.crag[0]?.name : (climb.crag as unknown as { name: string })?.name || 'Unknown Crag'

    await notifyNewFlag(supabase, {
      type: 'climb',
      flagType: flag_type,
      targetName: climb.name,
      cragName,
      cragId: climb.crag_id,
      comment: comment.trim(),
      flaggerId: user.id,
    }).catch(err => console.error('Discord notification error:', err))

    return NextResponse.json({
      success: true,
      flag: {
        id: flag.id,
        flag_type,
        comment: comment.trim(),
        status: 'pending',
      },
      message: 'Flag submitted successfully. An admin will review it soon.'
    })
  } catch (error) {
    return createErrorResponse(error, 'Flag error')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: climbId } = await params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  try {
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
        flagger:flagger_id(id, email, username, first_name, last_name)
      `)
      .eq('climb_id', climbId)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching flags')
    }

    return NextResponse.json({
      flags: data || [],
      count: data?.length || 0
    })
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}
