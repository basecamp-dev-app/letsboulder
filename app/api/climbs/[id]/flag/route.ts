import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewFlag } from '@/lib/discord'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

const VALID_FLAG_TYPES = ['location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface FlagRow {
  id: string
  flag_type: string
  comment: string
  status: string
  action_taken: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  flagger_id: string | null
}

interface FlaggerProfile {
  id: string
  email: string | null
  username: string | null
  first_name: string | null
  last_name: string | null
}

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
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!climbId) {
      return NextResponse.json({ error: 'Climb ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { flag_type, comment } = body

    if (typeof comment !== 'string') {
      return NextResponse.json({ error: 'Comment must be at least 10 characters' }, { status: 400 })
    }

    const trimmedComment = comment.trim()

    if (!flag_type || !VALID_FLAG_TYPES.includes(flag_type)) {
      return NextResponse.json({
        error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`
      }, { status: 400 })
    }

    if (!trimmedComment || trimmedComment.length < 10) {
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
      .eq('flagger_id', userId)
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
        flagger_id: userId,
        flag_type,
        comment: trimmedComment,
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
      comment: trimmedComment,
      flaggerId: userId,
    }).catch(err => console.error('Discord notification error:', err))

    return NextResponse.json({
      success: true,
      flag: {
        id: flag.id,
        flag_type,
        comment: trimmedComment,
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
  const cookies = request.cookies
  const { id: climbId } = await params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'

  const supabase = await createServerClient(
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
    if (!UUID_PATTERN.test(climbId)) {
      return NextResponse.json({ flags: [], count: 0 })
    }

    let canViewFlaggerEmail = false
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single()

      canViewFlaggerEmail = Boolean(profile?.is_admin)
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
        flagger_id
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

    const flagRows = ((data || []) as FlagRow[])
    const flaggerIds: string[] = []
    for (const row of flagRows) {
      if (typeof row.flagger_id === 'string' && row.flagger_id) {
        flaggerIds.push(row.flagger_id)
      }
    }

    const uniqueFlaggerIds = [...new Set(flaggerIds)]
    const profileMap = new Map<string, FlaggerProfile>()

    if (uniqueFlaggerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, username, first_name, last_name')
        .in('id', uniqueFlaggerIds)

      if (profilesError) {
        return createErrorResponse(profilesError, 'Error fetching flagger profiles')
      }

      for (const profile of (profiles || []) as FlaggerProfile[]) {
        profileMap.set(profile.id, profile)
      }
    }

    const flags = [] as Array<{
      id: string
      flag_type: string
      comment: string
      status: string
      action_taken: string | null
      resolved_by: string | null
      resolved_at: string | null
      created_at: string
      flagger: {
        id: string | null
        username: string | null
        first_name: string | null
        last_name: string | null
        email?: string | null
      }
    }>

    for (const row of flagRows) {
      const profile = row.flagger_id ? profileMap.get(row.flagger_id) : undefined
      const flagger = {
        id: row.flagger_id,
        username: profile?.username || null,
        first_name: profile?.first_name || null,
        last_name: profile?.last_name || null,
      } as {
        id: string | null
        username: string | null
        first_name: string | null
        last_name: string | null
        email?: string | null
      }

      if (canViewFlaggerEmail) {
        flagger.email = profile?.email || null
      }

      flags.push({
        id: row.id,
        flag_type: row.flag_type,
        comment: row.comment,
        status: row.status,
        action_taken: row.action_taken,
        resolved_by: row.resolved_by,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        flagger,
      })
    }

    return NextResponse.json({
      flags,
      count: flags.length
    })
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}
