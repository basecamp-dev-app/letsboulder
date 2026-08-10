import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { claimCollaboratorInvite } from '@/features/submissions/server/collaboration/shared-collaborators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const tokenValue = typeof token === 'string' ? token.trim() : ''

  if (!tokenValue) {
    return NextResponse.redirect(new URL('/logbook?error=invalid-collab-invite', request.url))
  }

  return NextResponse.redirect(new URL(`/collaborate/submission/${encodeURIComponent(tokenValue)}`, request.url))
}

const submissionInviteConfig = {
  claimInviteRpc: 'claim_submission_collaborator_invite' as const,
  successRedirectPath: (resourceId: string) => `/logbook/submissions/${resourceId}/edit?collab=added`,
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
  return claimCollaboratorInvite({
    supabase: middlewareResult.supabase,
    token,
    config: submissionInviteConfig,
  })
}
