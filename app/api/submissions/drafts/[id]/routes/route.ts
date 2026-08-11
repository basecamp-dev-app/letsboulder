import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getServerClient } from '@/lib/supabase-server'
import { normalizeDraftRouteBatchPayload, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'
import { syncSubmissionDraftRoutes } from '@/features/submissions/server/drafts/draft-write-service'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const middlewareResult = await withApiMiddleware(request, { unauthorizedMessage: 'Authentication required', rateLimitKey: 'draftSave' })
  if (!middlewareResult.ok) return middlewareResult.response
  const { id } = await params
  const body = await request.json().catch(() => null as { draftImageId?: unknown; routes?: unknown; images?: unknown } | null)
  const imageBatches = normalizeDraftRouteBatchPayload(body?.images)
  const batches = imageBatches || (typeof body?.draftImageId === 'string' && normalizeDraftRoutePayload(body.routes)
    ? [{ draftImageId: body.draftImageId, routes: body.routes }]
    : null)
  if (!id || !batches) return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
  const result = await syncSubmissionDraftRoutes({ supabase: await getServerClient(), userId: middlewareResult.userId, draftId: id, batches })
  if (result.kind === 'success') return NextResponse.json({ success: true })
  if (result.kind === 'not_found') return NextResponse.json({ error: 'Forbidden' }, { status: 404 })
  if (result.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ error: 'Failed to sync draft routes' }, { status: 500 })
}
