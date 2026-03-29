import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import {
  normalizeDeletePayload,
  normalizeRouteNameForMatch,
  pickOne,
} from '@/features/submissions/server/submissions/route-line-utils'
import { loadEditableImageContext, revalidateSubmissionImagePaths, type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

interface TransferTargetCandidate {
  routeLineId: string
  climbId: string
  climbName: string
  grade: string | null
}

interface SiblingRouteLineRow {
  id: string
  climb_id: string
  climbs: { name: string | null; grade: string | null } | Array<{ name: string | null; grade: string | null }> | null
}

export async function deleteSubmissionRoute(
  deps: SubmissionRouteMutationDeps,
  body: unknown
) {
  const { supabase, supabaseAdmin, userId, imageId } = deps
  const payload = normalizeDeletePayload(body)
  if (!payload) {
    return NextResponse.json({ error: 'A valid routeLineId is required' }, { status: 400 })
  }

  const imageContext = await loadEditableImageContext(
    supabase,
    imageId,
    userId,
    'Only the owner or a collaborator can delete routes for this image'
  )
  if (imageContext.error) return imageContext.error

  const { image } = imageContext
  const { data: currentRouteLine, error: routeLineError } = await supabase
    .from('route_lines')
    .select('id, climb_id, climbs(name)')
    .eq('id', payload.routeLineId)
    .eq('image_id', imageId)
    .maybeSingle()

  if (routeLineError) return createErrorResponse(routeLineError, 'Delete route error')
  if (!currentRouteLine) {
    return NextResponse.json({ error: 'Route not found for this submission' }, { status: 404 })
  }

  const currentRouteClimb = pickOne(currentRouteLine.climbs as { name: string | null } | Array<{ name: string | null }> | null)
  const currentRouteName = currentRouteClimb?.name || ''
  const oldClimbId = currentRouteLine.climb_id
  const writeClient = supabaseAdmin || supabase

  let targetClimbId: string | null = null
  if (payload.transferLogsToSameName && currentRouteName.trim().length > 0) {
    const { data: siblingRouteLines, error: siblingError } = await supabase
      .from('route_lines')
      .select('id, climb_id, sequence_order, climbs(name, grade)')
      .eq('image_id', imageId)
      .neq('id', payload.routeLineId)

    if (siblingError) return createErrorResponse(siblingError, 'Delete route error')

    const sourceName = normalizeRouteNameForMatch(currentRouteName)
    const candidates: TransferTargetCandidate[] = (siblingRouteLines || []).map((routeLine: SiblingRouteLineRow) => {
      const climb = pickOne(routeLine.climbs as { name: string | null; grade: string | null } | Array<{ name: string | null; grade: string | null }> | null)
      return {
        routeLineId: routeLine.id,
        climbId: routeLine.climb_id,
        climbName: climb?.name || '',
        grade: climb?.grade || null,
      }
    }).filter((candidate: TransferTargetCandidate) => normalizeRouteNameForMatch(candidate.climbName) === sourceName)

    if (payload.targetRouteLineId) {
      const selectedTarget = candidates.find((candidate) => candidate.routeLineId === payload.targetRouteLineId)
      if (!selectedTarget) {
        return NextResponse.json({ error: 'Selected transfer target is invalid' }, { status: 400 })
      }
      targetClimbId = selectedTarget.climbId
    } else if (candidates.length > 1) {
      return NextResponse.json({
        error: 'Multiple matching routes found. Choose a transfer target before deleting.',
        code: 'multiple_transfer_targets',
        sourceRouteName: currentRouteName,
        candidates: candidates.map((candidate) => ({
          routeLineId: candidate.routeLineId,
          climbName: candidate.climbName,
          grade: candidate.grade,
        })),
      }, { status: 409 })
    } else if (candidates.length === 1) {
      targetClimbId = candidates[0].climbId
    }
  }

  let movedLogs = 0
  let droppedDuplicateLogs = 0

  if (targetClimbId && targetClimbId !== oldClimbId) {
    const { data: oldLogs, error: oldLogsError } = await writeClient
      .from('user_climbs')
      .select('id, user_id')
      .eq('climb_id', oldClimbId)

    if (oldLogsError) return createErrorResponse(oldLogsError, 'Delete route error')

    const oldLogsByUserId = new Map<string, string>()
    for (const oldLog of oldLogs || []) {
      if (typeof oldLog.user_id !== 'string' || typeof oldLog.id !== 'string') continue
      oldLogsByUserId.set(oldLog.user_id, oldLog.id)
    }

    if (oldLogsByUserId.size > 0) {
      const userIds = [...oldLogsByUserId.keys()]
      const { data: targetLogs, error: targetLogsError } = await writeClient
        .from('user_climbs')
        .select('user_id')
        .eq('climb_id', targetClimbId)
        .in('user_id', userIds)

      if (targetLogsError) return createErrorResponse(targetLogsError, 'Delete route error')

      const usersWithTargetLog = new Set(
        (targetLogs || [])
          .map((row: { user_id: string | null }) => row.user_id)
          .filter((userId: string | null): userId is string => typeof userId === 'string')
      )

      for (const [oldUserId, oldLogId] of oldLogsByUserId.entries()) {
        if (usersWithTargetLog.has(oldUserId)) {
          const { error: deleteDuplicateError } = await writeClient.from('user_climbs').delete().eq('id', oldLogId)
          if (deleteDuplicateError) return createErrorResponse(deleteDuplicateError, 'Delete route error')
          droppedDuplicateLogs += 1
          continue
        }

        const { error: moveLogError } = await writeClient.from('user_climbs').update({ climb_id: targetClimbId }).eq('id', oldLogId)
        if (moveLogError) return createErrorResponse(moveLogError, 'Delete route error')
        movedLogs += 1
      }
    }
  }

  const { error: deleteClimbError } = await writeClient.from('climbs').delete().eq('id', oldClimbId)
  if (deleteClimbError) return createErrorResponse(deleteClimbError, 'Delete route error')

  await writeClient.from('images').update({ last_edited_by: userId }).eq('id', imageId)
  await revalidateSubmissionImagePaths(supabase, image.crag_id)

  return NextResponse.json({ success: true, movedLogs, droppedDuplicateLogs })
}
