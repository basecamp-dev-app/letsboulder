import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'
import { deleteSubmissionDraft, patchSubmissionDraft, saveSubmissionDraftAtomic } from '@/features/submissions/server/drafts/draft-write-service'
import { fetchDraft } from '@/features/submissions/server/drafts/draft-fetch'
import { OPEN_DATA_CONSENT_REQUIRED } from '@/features/legal/public-server'

const draftPatchSchema = z.object({
  images: z.array(z.object({ id: z.string().min(1), display_order: z.number().int().min(0), route_data: z.unknown().optional() })).min(1, 'images must be a non-empty array of {id, display_order, route_data}'),
  expected_updated_at: z.string().min(1, 'expected_updated_at is required and must be a valid ISO timestamp'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cragId: z.string().nullable().optional(),
  routeSets: z.array(z.object({ draftImageId: z.string().min(1), routes: z.unknown() })).optional(),
}).superRefine((value, context) => {
  if (value.routeSets !== undefined && value.metadata === undefined) {
    context.addIssue({ code: 'custom', path: ['metadata'], message: 'metadata is required for atomic saves' })
  }
  if (value.routeSets !== undefined && value.cragId === undefined) {
    context.addIssue({ code: 'custom', path: ['cragId'], message: 'cragId is required for atomic saves' })
  }
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fetchDraft(id, request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'draftSave',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  const parsed = parseWithSchema(draftPatchSchema, await request.json().catch(() => null))
  if (!parsed.success) return parsed.response
  const expectedUpdatedAt = parsed.data.expected_updated_at.trim()
  if (Number.isNaN(new Date(expectedUpdatedAt).getTime())) return NextResponse.json({ error: 'expected_updated_at is required and must be a valid ISO timestamp' }, { status: 400 })
  if (parsed.data.routeSets !== undefined && (parsed.data.metadata === undefined || parsed.data.cragId === undefined)) {
    return NextResponse.json({ error: 'metadata and cragId are required for atomic saves' }, { status: 400 })
  }
  const images = parsed.data.images.map((image) => ({ id: image.id, display_order: image.display_order, route_data: image.route_data && typeof image.route_data === 'object' && !Array.isArray(image.route_data) ? image.route_data as Record<string, unknown> : {} }))
  const result = parsed.data.routeSets !== undefined
    ? await saveSubmissionDraftAtomic({
        supabase: middlewareResult.supabase, draftId: id, expectedUpdatedAt, images,
        routeSets: parsed.data.routeSets, metadata: parsed.data.metadata!, cragId: parsed.data.cragId!,
      })
    : await patchSubmissionDraft({
        supabase: middlewareResult.supabase, userId: middlewareResult.userId, draftId: id, expectedUpdatedAt,
        images, metadata: parsed.data.metadata, cragId: parsed.data.cragId,
      })
  if (result.kind === 'success') return NextResponse.json({ success: true, draft: result.updatedAt ? { ...(result.draft || {}), updated_at: result.updatedAt } : result.draft })
  if (result.kind === 'conflict') return NextResponse.json(result.conflict, { status: 409 })
  if (result.kind === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (result.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (result.kind === 'not_editable') return NextResponse.json({ error: 'Only draft submissions can be edited' }, { status: 400 })
  if (result.kind === 'invalid') return NextResponse.json({ error: result.error || 'Invalid request data' }, { status: 400 })
  if (result.kind === 'consent_required') return NextResponse.json({ code: OPEN_DATA_CONSENT_REQUIRED, error: OPEN_DATA_CONSENT_REQUIRED }, { status: 428 })
  return NextResponse.json({ error: result.error, ...(result.errorId ? { errorId: result.errorId } : {}) }, { status: 500 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  const result = await deleteSubmissionDraft({ supabase: middlewareResult.supabase, draftId: id, cleanupAuditReason: 'delete draft storage cleanup' })
  if (result.kind === 'success') return NextResponse.json({ success: true })
  if (result.kind === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (result.kind === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (result.kind === 'not_editable') return NextResponse.json({ error: 'Only draft submissions can be deleted' }, { status: 409 })
  if (result.kind === 'conflict') return NextResponse.json({ error: 'The draft changed while it was being deleted' }, { status: 409 })
  return NextResponse.json({ error: result.error, ...(result.errorId ? { errorId: result.errorId } : {}) }, { status: 500 })
}
