import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'
import { QueueItemVoteSchema } from '@/lib/supabase-result-schemas'



const moderationQueueVoteSchema = z.object({
  vote_type: z.enum(['verify', 'flag']),
  reason: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: queueId } = await params

  const { supabase, userId } = middlewareResult

  try {
    if (!queueId) {
      return NextResponse.json({ error: 'Queue ID required' }, { status: 400 })
    }

    const parsedBody = parseWithSchema(moderationQueueVoteSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { vote_type, reason } = parsedBody.data

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
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

    const queueItem = QueueItemVoteSchema.parse(rawData)

    if (queueItem.status !== 'pending') {
      return NextResponse.json({ error: 'This submission has already been resolved' }, { status: 400 })
    }

    if (queueItem.submitter_id === userId) {
      return NextResponse.json({ error: 'You cannot vote on your own submission' }, { status: 400 })
    }

    const { data: existingVote } = await supabase
      .from('moderation_votes')
      .select('id')
      .eq('queue_id', queueId)
      .eq('voter_id', userId)
      .single()

    if (existingVote) {
      return NextResponse.json({ error: 'You have already voted on this submission' }, { status: 400 })
    }

    const { error: insertError } = await supabase
      .from('moderation_votes')
      .insert({
        queue_id: queueId,
        voter_id: userId,
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

    if (queueItem.submitter_id !== userId) {
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
