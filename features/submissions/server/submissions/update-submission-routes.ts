import { NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { MAX_ROUTES_PER_REQUEST, normalizeRoutes } from '@/features/submissions/server/submissions/route-line-utils'
import { revalidateSubmissionImagePaths, type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'

export async function updateSubmissionRoutes(
  deps: SubmissionRouteMutationDeps,
  body: unknown
) {
  const { supabase, imageId } = deps
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
