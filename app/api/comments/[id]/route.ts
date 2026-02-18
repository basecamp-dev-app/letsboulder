import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { withCsrfProtection } from '@/lib/csrf-server'

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
    const { data: authResult, error: authError } = await supabase.auth.getUser()
    const user = authResult.user

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 })
    }

    const { data: deletedComment, error: deleteError } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('author_id', user.id)
      .is('deleted_at', null)
      .select('id')
      .single()

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
      }
      return createErrorResponse(deleteError, 'Error deleting comment')
    }

    if (!deletedComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, id: deletedComment.id })
  } catch (error) {
    return createErrorResponse(error, 'Comments DELETE error')
  }
}
