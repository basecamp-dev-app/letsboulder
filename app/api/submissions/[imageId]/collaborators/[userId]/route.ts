import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string; userId: string }> }
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
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId, userId } = await params
    if (!imageId || !userId) {
      return NextResponse.json({ error: 'Image ID and user ID are required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, created_by')
      .eq('id', imageId)
      .maybeSingle()

    if (imageError) {
      return createErrorResponse(imageError, 'Remove collaborator error')
    }

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!image.created_by || image.created_by !== requesterId) {
      return NextResponse.json({ error: 'Only the submission owner can remove collaborators' }, { status: 403 })
    }

    if (userId === image.created_by) {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('submission_collaborators')
      .delete()
      .eq('image_id', imageId)
      .eq('user_id', userId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Remove collaborator error')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Remove collaborator error')
  }
}
