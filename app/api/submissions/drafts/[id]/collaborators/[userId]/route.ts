import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { removeDraftCollaborator } from '@/features/submissions/server/drafts/draft-collaborators'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId: requesterId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !requesterId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', requesterId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) return rateLimitResponse

    const { id, userId } = await params
    if (!id || !userId) {
      return NextResponse.json({ error: 'Draft ID and user ID are required' }, { status: 400 })
    }

    return removeDraftCollaborator({ supabase, draftId: id, collaboratorUserId: userId, requesterId })
  } catch (error) {
    return createErrorResponse(error, 'Remove draft collaborator error')
  }
}
