import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { promoteDraftToSubmission, type DraftPublishResult } from '@/features/submissions/server/drafts/draft-promote'

const MEDIA_READY_RETRY_DELAYS_MS = [250, 750, 1500]

function isMediaNotReady(result: DraftPublishResult): boolean {
  return result.kind === 'failure'
    && result.status === 409
    && result.payload.code === 'media_not_ready'
}

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
  let result = await promoteDraftToSubmission({
    supabase: middlewareResult.supabase,
    draftId: id,
    userId: middlewareResult.userId,
  })

  for (const delayMs of MEDIA_READY_RETRY_DELAYS_MS) {
    if (!isMediaNotReady(result)) break
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    result = await promoteDraftToSubmission({
      supabase: middlewareResult.supabase,
      draftId: id,
      userId: middlewareResult.userId,
    })
  }

  if (result.kind === 'success') return NextResponse.json({ success: true, ...result.value })
  return NextResponse.json(result.payload, { status: result.status })
}
