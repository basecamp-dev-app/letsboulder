import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getServerClient } from '@/lib/supabase-server'
import { assertDraftReadAccess, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'

interface RouteSyncBody {
  draftImageId?: unknown
  routes?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  const body = await request.json().catch(() => null as RouteSyncBody | null)
  const draftImageId = typeof body?.draftImageId === 'string' ? body.draftImageId : ''
  const routes = normalizeDraftRoutePayload(body?.routes)

  if (!id || !draftImageId || !routes) {
    return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
  }

  const supabase = await getServerClient()
  const access = await assertDraftReadAccess(supabase, id, middlewareResult.userId)
  if (access.error) {
    return NextResponse.json({ error: 'Forbidden' }, { status: access.error.status })
  }

  const { error } = await supabase.rpc('sync_submission_draft_routes', {
    p_draft_id: id,
    p_draft_image_id: draftImageId,
    p_routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      grade: route.grade,
      description: route.description,
      climbType: route.climbType,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
      imageWidth: route.imageWidth,
      imageHeight: route.imageHeight,
    })),
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to sync draft routes' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
