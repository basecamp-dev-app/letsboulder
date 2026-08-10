import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { claimDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const tokenValue = typeof token === 'string' ? token.trim() : ''
  if (!tokenValue) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-draft-collab-invite', request.url))
  }

  return NextResponse.redirect(new URL(`/collaborate/draft/${encodeURIComponent(tokenValue)}`, request.url))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { token } = await params
  return claimDraftInvite({ supabase: middlewareResult.supabase, token })
}
