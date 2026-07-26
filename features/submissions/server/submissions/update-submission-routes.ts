import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { recordAcceptedWikiContribution } from '@/features/community/lib/contributor-score'
import { MAX_ROUTES_PER_REQUEST, normalizeRoutes } from '@/features/submissions/server/submissions/route-line-utils'
import { revalidateSubmissionImagePaths, type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'
import { assessNonOwnerGeometryRisk, assessNonOwnerTextRisk, combineRiskAssessments } from '@/features/submissions/server/submissions/wiki-edit-protection'
import { parseRoutePoints } from '@/features/route-editor/route-editor-utils'

export async function updateSubmissionRoutes(
  deps: SubmissionRouteMutationDeps,
  body: unknown
) {
  const { supabase, imageId, userId } = deps
  const routes = normalizeRoutes((body as { routes?: unknown } | null)?.routes)
  if (!routes || routes.length === 0) {
    return NextResponse.json({ error: 'A valid routes array is required' }, { status: 400 })
  }

  if (routes.length > MAX_ROUTES_PER_REQUEST) {
    return NextResponse.json({ error: `You can update up to ${MAX_ROUTES_PER_REQUEST} routes at once` }, { status: 400 })
  }

  for (const route of routes) {
    if (!route.name.trim()) return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
    if (route.name.trim().length > 200) return NextResponse.json({ error: 'Route name must be 200 characters or less' }, { status: 400 })
    if (route.description && route.description.trim().length > 500) {
      return NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 })
    }
  }

  const { data: imageOwner } = await supabase.from('images').select('created_by').eq('id', imageId).maybeSingle()
  const ownerId = typeof imageOwner?.created_by === 'string' ? imageOwner.created_by : null

  if (ownerId && ownerId !== userId) {
    const routeIds = routes.map((route) => route.id)
    const { data: existingRouteRows, error: existingRouteError } = await supabase
      .from('route_lines')
      .select('id, points, sequence_order, climbs(id, name, description)')
      .eq('image_id', imageId)
      .in('id', routeIds)

    if (existingRouteError) {
      return createErrorResponse(existingRouteError, 'Update submitted routes error')
    }

    const existingRouteMap = new Map((existingRouteRows || []).map((row) => [row.id, row]))

    for (const route of routes) {
      const existingRoute = existingRouteMap.get(route.id)
      const existingClimb = Array.isArray(existingRoute?.climbs) ? existingRoute.climbs[0] : existingRoute?.climbs
      if (!existingRoute || !existingClimb) continue

      const risk = combineRiskAssessments([
        assessNonOwnerTextRisk({ field: 'route_name', previousValue: existingClimb.name, nextValue: route.name.trim() }),
        assessNonOwnerTextRisk({ field: 'route_description', previousValue: existingClimb.description, nextValue: route.description?.trim() || null }),
        assessNonOwnerGeometryRisk({
          previousPoints: parseRoutePoints(existingRoute.points as string | null),
          nextPoints: route.points,
        }),
      ])

      if (risk.riskLevel === 'high_risk') {
        await supabase.rpc('log_submission_edit', {
          p_image_id: imageId,
          p_edited_by: userId,
          p_edit_kind: 'route_update_blocked',
          p_summary: `Blocked risky update to "${existingClimb.name || route.name.trim() || 'Unnamed route'}"`,
          p_before_data: {
            route_line_id: route.id,
            name: existingClimb.name,
            description: existingClimb.description,
            points: existingRoute.points,
          },
          p_after_data: {
            route_line_id: route.id,
            name: route.name.trim(),
            description: route.description?.trim() || null,
            points: route.points,
          },
          p_risk_level: risk.riskLevel,
          p_moderation_state: risk.moderationState,
          p_risk_reasons: risk.reasons,
          p_field_targets: risk.fieldTargets,
        })

        return NextResponse.json({ error: 'This edit was blocked because it removes too much value from the route.', risk: risk.reasons }, { status: 403 })
      }
    }
  }

  const routeIds = routes.map((route) => route.id)
  const { data: existingAcceptedEditIds } = await supabase
    .from('submission_edit_history')
    .select('id')
    .eq('image_id', imageId)
    .eq('edited_by', userId)
    .eq('moderation_state', 'accepted')

  const acceptedEditIdsBeforeUpdate = new Set((existingAcceptedEditIds || []).map((row) => row.id))

  const { data: updateResult, error: updateError } = await supabase.rpc('update_own_submitted_routes', {
    p_image_id: imageId,
    p_routes: routes.map((route) => ({
      id: route.id,
      name: route.name.trim(),
      description: route.description?.trim() || null,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
    })),
  })

  if (updateError) {
    const message = (updateError.message || '').toLowerCase()
    if (message.includes('permission')) {
      return NextResponse.json({ error: 'You do not have permission to edit routes for this submission' }, { status: 403 })
    }
    return createErrorResponse(updateError, 'Update submitted routes error')
  }

  const { data: acceptedEditsAfterUpdate } = await supabase
    .from('submission_edit_history')
    .select('id')
    .eq('image_id', imageId)
    .eq('edited_by', userId)
    .eq('moderation_state', 'accepted')
    .in('edit_kind', ['route_updated'])
    .order('created_at', { ascending: false })
    .limit(Math.max(routeIds.length, 1))

  const newAcceptedEdits = (acceptedEditsAfterUpdate || []).filter((row) => !acceptedEditIdsBeforeUpdate.has(row.id))

  for (const edit of newAcceptedEdits) {
    await recordAcceptedWikiContribution(edit.id)
  }

  const { data: image } = await supabase
    .from('images')
    .select('crag_id')
    .eq('id', imageId)
    .single()

  await revalidateSubmissionImagePaths(supabase, image?.crag_id ?? null)

  return NextResponse.json({
    success: true,
    updatedCount: typeof updateResult === 'number' ? updateResult : routes.length,
    message: 'Routes updated successfully',
  })
}
