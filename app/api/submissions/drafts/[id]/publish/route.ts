import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'draftPublish',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id } = await params
  const result = await promoteDraftToSubmission({
    supabase: middlewareResult.supabase,
    draftId: id,
    userId: middlewareResult.userId,
  })
  if (result.kind === 'success') return NextResponse.json({ success: true, ...result.value })
  return NextResponse.json(result.payload, { status: result.status })
}
