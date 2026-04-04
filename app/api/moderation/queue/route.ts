import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { QueueItemSchema } from '@/lib/supabase-result-schemas'



export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'pending'
  const cragId = searchParams.get('crag_id')

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId } = await resolveUserIdWithFallback(request, supabase)
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const rateLimitResult = await rateLimit(request, 'authenticatedWrite', userId)
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

    const queue = z.array(QueueItemSchema).parse(rawData || [])

    return NextResponse.json({ 
      queue,
      count: queue.length 
    })
  } catch (error) {
    return createErrorResponse(error, 'Queue fetch error')
  }
}
