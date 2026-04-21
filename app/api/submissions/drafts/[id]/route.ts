import { NextRequest } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { fetchDraft } from '@/features/submissions/server/drafts/draft-fetch'
import { patchDraft } from '@/features/submissions/server/drafts/draft-patch'
import { deleteDraft } from '@/features/submissions/server/drafts/draft-delete'

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
  return patchDraft(id, request, middlewareResult)
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
  return deleteDraft(id, middlewareResult)
}
