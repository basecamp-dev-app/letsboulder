import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

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

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle()

    if (draftError) return createErrorResponse(draftError, 'Remove draft collaborator error')
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be updated' }, { status: 400 })
    }

    const isOwner = draft.user_id === requesterId
    const isSelfLeave = requesterId === userId

    if (userId === draft.user_id) {
      return NextResponse.json({ error: 'Owner cannot be removed from draft' }, { status: 400 })
    }

    if (!isOwner && !isSelfLeave) {
      return NextResponse.json({ error: 'Only the owner can remove collaborators' }, { status: 403 })
    }

    const { data: existingCollaborator, error: existingCollaboratorError } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id')
      .eq('draft_id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingCollaboratorError) return createErrorResponse(existingCollaboratorError, 'Remove draft collaborator error')
    if (!existingCollaborator) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('submission_draft_collaborators')
      .delete()
      .eq('draft_id', id)
      .eq('user_id', userId)

    if (deleteError) return createErrorResponse(deleteError, 'Remove draft collaborator error')
    return NextResponse.json({ success: true, left: isSelfLeave && !isOwner })
  } catch (error) {
    return createErrorResponse(error, 'Remove draft collaborator error')
  }
}
