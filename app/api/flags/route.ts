import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { parsePagination } from '@/lib/pagination'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const { limit, offset } = parsePagination(searchParams)
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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
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
        flagger_id,
        image_id,
        crag_id,
        climb_id
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

    const flagsWithRelations = await Promise.all((flags || []).map(async (flag) => {
      const [image, crag, climb, flagger] = await Promise.all([
        flag.image_id ? supabase.from('images').select('id, url').eq('id', flag.image_id).single() : { data: null },
        flag.crag_id ? supabase.from('crags').select('id, name').eq('id', flag.crag_id).single() : { data: null },
        flag.climb_id ? supabase.from('climbs').select('id, name, grade').eq('id', flag.climb_id).single() : { data: null },
        flag.flagger_id ? supabase.from('profiles').select('id, email, username').eq('id', flag.flagger_id).single() : { data: null },
      ])

      return {
        ...flag,
        image: image.data,
        crag: crag.data,
        climbs: climb.data,
        flagger: flagger.data,
      }
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
