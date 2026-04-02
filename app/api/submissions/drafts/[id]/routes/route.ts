import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { assertDraftReadAccess, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const access = await assertDraftReadAccess(supabase, id, userId)
    if (access.error) return access.error

    const { data: routes, error: routesError } = await supabase
      .from('submission_draft_routes')
      .select('id, draft_image_id, name, grade, description, climb_type, points, sequence_order, image_width, image_height, created_at, updated_at')
      .eq('draft_id', id)
      .order('draft_image_id', { ascending: true })
      .order('sequence_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (routesError) {
      return createErrorResponse(routesError, 'Failed to fetch draft routes')
    }

    return NextResponse.json({ routes: routes || [] })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch draft routes')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as { draftImageId?: string; routes?: unknown } | null
    const draftImageId = typeof body?.draftImageId === 'string' ? body.draftImageId : ''
    const routes = normalizeDraftRoutePayload(body?.routes)

    if (!draftImageId) {
      return NextResponse.json({ error: 'draftImageId is required' }, { status: 400 })
    }

    if (!routes) {
      return NextResponse.json({ error: 'routes must be an array' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('sync_submission_draft_routes', {
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
      return createErrorResponse(error, 'Failed to sync draft routes')
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    return createErrorResponse(error, 'Failed to sync draft routes')
  }
}
