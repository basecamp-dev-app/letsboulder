import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface RouteParams {
  postId: string
  commentId: string
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { postId, commentId } = await params
  if (!postId || !commentId) {
    return NextResponse.json({ error: 'Missing identifiers' }, { status: 400 })
  }

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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: comment } = await supabase
      .from('community_post_comments')
      .select('id, post_id, author_id')
      .eq('id', commentId)
      .eq('post_id', postId)
      .maybeSingle()

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (comment.author_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('community_post_comments')
      .delete()
      .eq('id', commentId)
      .eq('post_id', postId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting comment')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Error deleting comment')
  }
}
