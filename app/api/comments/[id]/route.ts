import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { withCsrfProtection } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

function getSupabase(request: NextRequest) {
  const cookies = request.cookies
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getSupabase(request)

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

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 })
    }

    const { data: deleted, error: deleteError } = await supabase.rpc('soft_delete_comment', {
      p_comment_id: id,
    })

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting comment')
    }

    if (!deleted) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, id })
  } catch (error) {
    return createErrorResponse(error, 'Comments DELETE error')
  }
}
