import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface QueueItem {
  id: string
  status: string
  crag_id: string
  submitter_id: string
  verify_count: number
  flag_count: number
  climb: { id: string; name: string; grade: string } | null
  crag: { id: string; name: string } | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: queueId } = await params

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

    if (!queueId) {
      return NextResponse.json({ error: 'Queue ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { vote_type, reason } = body

    if (!vote_type || !['verify', 'flag'].includes(vote_type)) {
      return NextResponse.json({ error: 'Vote type must be "verify" or "flag"' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: rawData, error: queueError } = await supabase
      .from('moderation_queue')
      .select(`
        id,
        status,
        crag_id,
        submitter_id,
        verify_count,
        flag_count,
        climb:climb_id(id, name, grade),
        crag:crag_id(id, name)
      `)
      .eq('id', queueId)
      .single()

    if (queueError || !rawData) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }

    const queueItem = rawData as unknown as QueueItem

    if (queueItem.status !== 'pending') {
      return NextResponse.json({ error: 'This submission has already been resolved' }, { status: 400 })
    }

    if (queueItem.submitter_id === user.id) {
      return NextResponse.json({ error: 'You cannot vote on your own submission' }, { status: 400 })
    }

    const { data: existingVote } = await supabase
      .from('moderation_votes')
      .select('id')
      .eq('queue_id', queueId)
      .eq('voter_id', user.id)
      .single()

    if (existingVote) {
      return NextResponse.json({ error: 'You have already voted on this submission' }, { status: 400 })
    }

    const { error: insertError } = await supabase
      .from('moderation_votes')
      .insert({
        queue_id: queueId,
        voter_id: user.id,
        vote_type,
        reason,
      })

    if (insertError) {
      return createErrorResponse(insertError, 'Error recording vote')
    }

    const newVerifyCount = vote_type === 'verify'
      ? queueItem.verify_count + 1
      : queueItem.verify_count
    const newFlagCount = vote_type === 'flag'
      ? queueItem.flag_count + 1
      : queueItem.flag_count

    const wasResolved = newVerifyCount >= 3 || newFlagCount >= 3
    const resolutionStatus = newVerifyCount >= 3 ? 'verified' as const : newFlagCount >= 3 ? 'flagged' as const : null

    const climbName = queueItem.climb?.name || 'Unnamed route'
    const cragName = queueItem.crag?.name || 'Unknown crag'
    const cragId = queueItem.crag?.id || queueItem.crag_id

    if (queueItem.submitter_id !== user.id) {
      await supabase.from('notifications').insert({
        user_id: queueItem.submitter_id,
        type: wasResolved ? 'submission_resolved' : 'vote_recorded',
        title: wasResolved
          ? (resolutionStatus === 'verified' ? 'Route approved!' : 'Route flagged for removal')
          : 'New vote on your route',
        message: wasResolved
          ? `"${climbName}" at ${cragName} was ${resolutionStatus}`
          : `"${climbName}" at ${cragName} has ${newVerifyCount} verify and ${newFlagCount} flag votes`,
        link: `/crags/${cragId}`,
      })
    }

    return NextResponse.json({
      success: true,
      vote: vote_type,
      verify_count: newVerifyCount,
      flag_count: newFlagCount,
      resolved: wasResolved,
      status: resolutionStatus,
    })
  } catch (error) {
    return createErrorResponse(error, 'Vote error')
  }
}
