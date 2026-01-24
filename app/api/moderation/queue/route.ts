import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

interface QueueItem {
  id: string
  status: string
  verify_count: number
  flag_count: number
  quality_score: number | null
  created_at: string
  resolved_at: string | null
  climb: { id: string; name: string | null; grade: string; description: string | null; image_url: string | null } | null
  crag: { id: string; name: string } | null
  submitter: { id: string; email: string | null; username: string | null; first_name: string | null; last_name: string | null } | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const cragId = searchParams.get('crag_id')

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    let query = supabase
      .from('moderation_queue')
      .select(`
        id,
        status,
        verify_count,
        flag_count,
        quality_score,
        created_at,
        resolved_at,
        climb:climb_id(id, name, grade, description, image_url),
        crag:crag_id(id, name),
        submitter:submitter_id(id, email, username, first_name, last_name)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (cragId) {
      query = query.eq('crag_id', cragId)
    }

    const { data: rawData, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching moderation queue')
    }

    const queue = (rawData || []) as unknown as QueueItem[]

    return NextResponse.json({ 
      queue,
      count: queue.length 
    })
  } catch (error) {
    return createErrorResponse(error, 'Queue fetch error')
  }
}
