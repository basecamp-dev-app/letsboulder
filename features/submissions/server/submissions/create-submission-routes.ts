import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { isValidGrade } from '@/lib/grade-constants'
import { makeUniqueSlug, fetchUsedSlugs } from '@/lib/slug'
import { recordAcceptedWikiContribution } from '@/features/community/lib/contributor-score'
import {
  MAX_ROUTES_PER_REQUEST,
  normalizeNewRoutes,
  normalizeRouteType,
  type VALID_ROUTE_TYPES,
} from '@/features/submissions/server/submissions/route-line-utils'
import { loadEditableImageContext, revalidateSubmissionImagePaths, type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

export async function createSubmissionRoutes(
  deps: SubmissionRouteMutationDeps,
  body: unknown
) {
  const { supabase, supabaseAdmin, userId, imageId } = deps
  const routes = normalizeNewRoutes((body as { routes?: unknown } | null)?.routes)
  const submittedRouteType = typeof (body as { routeType?: unknown } | null)?.routeType === 'string'
    ? normalizeRouteType((body as { routeType: string }).routeType)
    : null

  if (typeof (body as { routeType?: unknown } | null)?.routeType === 'string' && !submittedRouteType) {
    return NextResponse.json({ error: 'Invalid route type' }, { status: 400 })
  }

  if (!routes || routes.length === 0) {
    return NextResponse.json({ error: 'A valid routes array is required' }, { status: 400 })
  }

  if (routes.length > MAX_ROUTES_PER_REQUEST) {
    return NextResponse.json({ error: `You can add up to ${MAX_ROUTES_PER_REQUEST} routes at once` }, { status: 400 })
  }

  for (const route of routes) {
    if (!route.name.trim()) return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
    if (!isValidGrade(route.grade)) return NextResponse.json({ error: 'Invalid route grade' }, { status: 400 })
    if (route.name.trim().length > 200) return NextResponse.json({ error: 'Route name must be 200 characters or less' }, { status: 400 })
    if (route.description && route.description.trim().length > 500) return NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 })
  }

  const imageContext = await loadEditableImageContext(
    supabase,
    imageId,
    userId,
    'You do not have permission to add routes to this submission'
  )
  if (imageContext.error) return imageContext.error

  const { image, ownerId } = imageContext
  const { data: existingRouteLines, error: existingRouteLinesError } = await supabase
    .from('route_lines')
    .select('sequence_order')
    .eq('image_id', imageId)

  if (existingRouteLinesError) return createErrorResponse(existingRouteLinesError, 'Create routes error')

  const startingSequenceOrder = (existingRouteLines || []).reduce((maxOrder: number, line: { sequence_order: number | null }) => {
    return Math.max(maxOrder, typeof line.sequence_order === 'number' ? line.sequence_order : 0)
  }, -1) + 1

  let fallbackRouteType: (typeof VALID_ROUTE_TYPES)[number] = 'sport'
  if (submittedRouteType) {
    fallbackRouteType = submittedRouteType
  } else {
    const { data: existingImageRouteLines } = await supabase
      .from('route_lines')
      .select('climbs (route_type)')
      .eq('image_id', imageId)
      .limit(50)

    const existingTypes = new Set<(typeof VALID_ROUTE_TYPES)[number]>()
    for (const row of (existingImageRouteLines || []) as Array<{ climbs: { route_type: string | null } | { route_type: string | null }[] | null }>) {
      const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
      const normalized = normalizeRouteType(climb?.route_type)
      if (normalized) existingTypes.add(normalized)
    }

    if (existingTypes.size === 1) {
      fallbackRouteType = [...existingTypes][0]
    }
  }

  const usedRouteSlugs = image.crag_id
    ? await fetchUsedSlugs(deps.supabase, 'climbs', { crag_id: image.crag_id })
    : new Set<string>()

  const climbsData = routes.map((route, index) => {
    const trimmedName = route.name.trim()
    const routeNumber = index + 1
    return {
      name: trimmedName || `Route ${routeNumber}`,
      slug: image.crag_id ? makeUniqueSlug(trimmedName || `Route ${routeNumber}`, usedRouteSlugs) : null,
      grade: route.grade,
      description: route.description?.trim() || null,
      route_type: route.climbType || fallbackRouteType,
      status: 'approved' as const,
      user_id: ownerId,
      crag_id: image.crag_id,
    }
  })

  const writeClient = supabaseAdmin || supabase
  const { data: climbs, error: climbsError } = await writeClient.from('climbs').insert(climbsData).select('id')
  if (climbsError) return createErrorResponse(climbsError, 'Create routes error')
  if (!climbs || climbs.length === 0) return NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })

  const routeLinesData = climbs.map((climb: { id: string }, index: number) => ({
    image_id: imageId,
    climb_id: climb.id,
    points: routes[index].points,
    color: 'red',
    sequence_order: startingSequenceOrder + index,
    image_width: routes[index].imageWidth,
    image_height: routes[index].imageHeight,
  }))

  const { data: createdRouteLines, error: routeLinesError } = await writeClient
    .from('route_lines')
    .insert(routeLinesData)
    .select('id, climb_id, points, sequence_order, image_width, image_height, climbs(id, name, grade, status, route_type, description)')
  if (routeLinesError) return createErrorResponse(routeLinesError, 'Create routes error')

  if (!supabaseAdmin) return NextResponse.json({ error: 'Service role key missing' }, { status: 500 })

  const voterUserIds = ownerId ? [ownerId] : []

  const gradeVoteRows = climbs.flatMap((climb: { id: string }, index: number) => {
    const grade = routes[index]?.grade
    if (!grade) return []
    return voterUserIds.map((voterUserId) => ({ climb_id: climb.id, user_id: voterUserId, grade }))
  })

  if (gradeVoteRows.length > 0) {
    const { error: gradeVotesError } = await supabaseAdmin.from('grade_votes').upsert(gradeVoteRows, { onConflict: 'climb_id,user_id' })
    if (gradeVotesError) return createErrorResponse(gradeVotesError, 'Create routes error')
  }

  await writeClient.from('images').update({ last_edited_by: userId }).eq('id', imageId)
  for (const [index, climb] of climbs.entries()) {
    const route = routes[index]
    if (!route) continue
    const { data: editHistoryId } = await supabase.rpc('log_submission_edit', {
      p_image_id: imageId,
      p_edited_by: userId,
      p_edit_kind: 'route_created',
      p_summary: climbs.length === 1 ? `Added route "${route.name.trim()}"` : `Added ${climbs.length} routes`,
      p_before_data: null,
      p_after_data: {
        climb_id: climb.id,
        name: route.name.trim(),
        grade: route.grade,
        description: route.description?.trim() || null,
      },
    })

    if (typeof editHistoryId === 'string') {
      await recordAcceptedWikiContribution(editHistoryId)
    }

    if (climbs.length > 1) break
  }
  await revalidateSubmissionImagePaths(supabase, image.crag_id)

  return NextResponse.json({
    success: true,
    createdCount: climbs.length,
    message: `Added ${climbs.length} route${climbs.length === 1 ? '' : 's'}`,
    routes: createdRouteLines || [],
  })
}
