import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    return promoteDraftToSubmission({ supabase, request, draftId: id, userId })
  } catch (error) {
    return createErrorResponse(error, 'Failed to publish draft')
  }
}
