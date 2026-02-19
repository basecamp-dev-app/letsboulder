import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface RouteParams {
  postId: string
}

interface CreateCommentBody {
  body?: string
}

interface CommentRow {
  id: string
  author_id: string
  body: string
  created_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

async function buildCommentPayload(
  supabase: ReturnType<typeof createServerClient>,
  postId: string,
  viewerId: string | null
) {
  const { data: commentRows } = await supabase
    .from('community_post_comments')
    .select('id, author_id, body, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(50)

  const comments = (commentRows || []) as CommentRow[]
  const authorIds = Array.from(new Set(comments.map(comment => comment.author_id)))
  const authorMap = new Map<string, ProfileRow>()

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', authorIds)

    for (const profile of (profiles || []) as ProfileRow[]) {
      authorMap.set(profile.id, profile)
    }
  }

  return comments.map(comment => ({
    id: comment.id,
    body: comment.body,
    created_at: comment.created_at,
    author: authorMap.get(comment.author_id) || null,
    is_owner: !!viewerId && viewerId === comment.author_id,
  }))
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { postId } = await params
  if (!postId) {
    return NextResponse.json({ error: 'Missing post id' }, { status: 400 })
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
    const { data: post } = await supabase
      .from('community_posts')
      .select('id, type')
      .eq('id', postId)
      .maybeSingle()

    if (!post || post.type !== 'session') {
      return NextResponse.json({ error: 'Session post not found' }, { status: 404 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const comments = await buildCommentPayload(supabase, postId, user?.id || null)
    return NextResponse.json({ comments })
  } catch (error) {
    return createErrorResponse(error, 'Error loading comments')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { postId } = await params
  if (!postId) {
    return NextResponse.json({ error: 'Missing post id' }, { status: 400 })
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

    const { data: post } = await supabase
      .from('community_posts')
      .select('id, type')
      .eq('id', postId)
      .maybeSingle()

    if (!post || post.type !== 'session') {
      return NextResponse.json({ error: 'Session post not found' }, { status: 404 })
    }

    const payload = await request.json().catch(() => ({} as CreateCommentBody))
    const body = payload.body?.trim() || ''

    if (body.length < 1 || body.length > 2000) {
      return NextResponse.json({ error: 'Comment must be between 1 and 2000 characters' }, { status: 400 })
    }

    const { error: insertError } = await supabase
      .from('community_post_comments')
      .insert({
        post_id: postId,
        author_id: user.id,
        body,
      })

    if (insertError) {
      return createErrorResponse(insertError, 'Error posting comment')
    }

    const comments = await buildCommentPayload(supabase, postId, user.id)
    return NextResponse.json({ comments }, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Error posting comment')
  }
}
