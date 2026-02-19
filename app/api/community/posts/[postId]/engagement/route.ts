import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

interface RouteParams {
  postId: string
}

type RsvpStatus = 'going' | 'interested'

interface CommunityCommentRow {
  id: string
  post_id: string
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

    const { data: rsvps } = await supabase
      .from('community_post_rsvps')
      .select('user_id, status')
      .eq('post_id', postId)

    let viewerRsvp: RsvpStatus | null = null
    let goingCount = 0
    let interestedCount = 0

    for (const rsvp of (rsvps || []) as Array<{ user_id: string; status: RsvpStatus }>) {
      if (rsvp.status === 'going') goingCount += 1
      if (rsvp.status === 'interested') interestedCount += 1
      if (user && rsvp.user_id === user.id) viewerRsvp = rsvp.status
    }

    const { data: commentRows } = await supabase
      .from('community_post_comments')
      .select('id, post_id, author_id, body, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(50)

    const typedComments = (commentRows || []) as CommunityCommentRow[]
    const authorIds = Array.from(new Set(typedComments.map(comment => comment.author_id)))

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

    const comments = typedComments.map(comment => ({
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at,
      author: authorMap.get(comment.author_id) || null,
      is_owner: !!user && user.id === comment.author_id,
    }))

    return NextResponse.json({
      rsvp_counts: {
        going: goingCount,
        interested: interestedCount,
      },
      viewer_rsvp: viewerRsvp,
      comments,
    })
  } catch (error) {
    return createErrorResponse(error, 'Error loading post engagement')
  }
}
