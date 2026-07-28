import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
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

  const supabase = getServerClientFromRequest(request)

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

    const { data: rsvpCounts, error: rsvpCountsError } = await supabase
      .from('community_post_rsvp_counts')
      .select('going_count, interested_count')
      .eq('post_id', postId)
      .maybeSingle()

    let viewerRsvp: RsvpStatus | null = null
    if (rsvpCountsError) {
      return createErrorResponse(rsvpCountsError, 'Error loading RSVP counts')
    }

    if (user) {
      const { data: ownRsvp, error: ownRsvpError } = await supabase
        .from('community_post_rsvps')
        .select('status')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (ownRsvpError) {
        return createErrorResponse(ownRsvpError, 'Error loading viewer RSVP')
      }
      viewerRsvp = (ownRsvp?.status as RsvpStatus | undefined) ?? null
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
        going: rsvpCounts?.going_count ?? 0,
        interested: rsvpCounts?.interested_count ?? 0,
      },
      viewer_rsvp: viewerRsvp,
      comments,
    })
  } catch (error) {
    return createErrorResponse(error, 'Error loading post engagement')
  }
}
