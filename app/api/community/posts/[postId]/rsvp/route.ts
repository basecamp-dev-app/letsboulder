import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'

interface RouteParams {
  postId: string
}

type RsvpStatus = 'going' | 'interested'

interface RsvpRequestBody {
  status?: RsvpStatus | null
}

function isValidStatus(status: unknown): status is RsvpStatus {
  return status === 'going' || status === 'interested'
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

    const payload = await request.json().catch(() => ({} as RsvpRequestBody))
    const status = payload.status ?? null

    if (status !== null && !isValidStatus(status)) {
      return NextResponse.json({ error: 'Invalid RSVP status' }, { status: 400 })
    }

    if (status === null) {
      const { error: deleteError } = await supabase
        .from('community_post_rsvps')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id)

      if (deleteError) {
        return createErrorResponse(deleteError, 'Error removing RSVP')
      }
    } else {
      const { error: upsertError } = await supabase
        .from('community_post_rsvps')
        .upsert(
          {
            post_id: postId,
            user_id: user.id,
            status,
          },
          { onConflict: 'post_id,user_id' }
        )

      if (upsertError) {
        return createErrorResponse(upsertError, 'Error updating RSVP')
      }
    }

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
      if (rsvp.user_id === user.id) viewerRsvp = rsvp.status
    }

    return NextResponse.json({
      rsvp_counts: {
        going: goingCount,
        interested: interestedCount,
      },
      viewer_rsvp: viewerRsvp,
    })
  } catch (error) {
    return createErrorResponse(error, 'Error updating RSVP')
  }
}
