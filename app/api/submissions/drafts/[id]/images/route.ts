import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { appendDraftImages } from '@/features/submissions/server/drafts/draft-images'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult

  try {
    const body = await request.json().catch(() => null)
    return appendDraftImages({ supabase, userId, draftId: id, requestBody: body })
  } catch (error) {
    return createErrorResponse(error, 'Failed to append draft images')
  }
}
