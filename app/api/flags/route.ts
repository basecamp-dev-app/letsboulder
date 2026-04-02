import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { parsePagination } from '@/lib/pagination'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const { limit, offset } = parsePagination(searchParams)

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
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
        flagger_id,
        image_id,
        crag_id,
        climb_id,
        images(id, url),
        crags(id, name),
        climbs(id, name, grade)
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

    const flaggerIds = [...new Set((flags || []).map(f => f.flagger_id).filter(Boolean))]
    const { data: flaggerProfiles } = flaggerIds.length > 0
      ? await supabase.from('profiles').select('id, email, username').in('id', flaggerIds)
      : { data: [] }

    const profileMap = new Map((flaggerProfiles || []).map(p => [p.id, p]))

    const flagsWithRelations = (flags || []).map((flag) => ({
      ...flag,
      image: flag.images ?? null,
      crag: flag.crags ?? null,
      climbs: flag.climbs ?? null,
      flagger: flag.flagger_id ? profileMap.get(flag.flagger_id) ?? null : null,
    }))

    let countQuery = supabase
      .from('climb_flags')
      .select('*', { count: 'exact', head: true })

    if (status !== 'all') {
      countQuery = countQuery.eq('status', status)
    }

    const { count } = await countQuery

    return NextResponse.json({
      flags: flagsWithRelations,
      count: count || 0,
    })
  } catch (error) {
    return createErrorResponse(error, 'Flags fetch error')
  }
}
