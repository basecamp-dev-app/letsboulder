import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest, getAdminClient } from '@/lib/supabase-server'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { deleteSubmission } from '@/features/submissions/server/submissions/delete-submission'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { imageId } = await params
  if (!imageId) {
    return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  const supabaseAdmin = getAdminClient()

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    return deleteSubmission({ supabase, supabaseAdmin, userId, imageId })
  } catch (error) {
    return createErrorResponse(error, 'Delete submission error')
  }
}
