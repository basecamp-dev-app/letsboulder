import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest, getAdminClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { createDraftInvite, listDraftCollaborators, revokeDraftInvite } from '@/features/submissions/server/drafts/draft-collaborators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerClientFromRequest(request)

  const readClient = getAdminClient()

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    return listDraftCollaborators({ supabase, readClient, draftId: id, userId })
  } catch (error) {
    return createErrorResponse(error, 'Load draft collaborators error')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) return rateLimitResponse

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    return createDraftInvite({ supabase, draftId: id, userId, requestBody: body, origin: request.nextUrl.origin })
  } catch (error) {
    return createErrorResponse(error, 'Create draft invite error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) return rateLimitResponse

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    return revokeDraftInvite({ supabase, draftId: id, userId, requestBody: body })
  } catch (error) {
    return createErrorResponse(error, 'Revoke draft invite error')
  }
}
