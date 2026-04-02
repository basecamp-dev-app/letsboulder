'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { getServerClient } from '@/lib/supabase-server'

type RsvpStatus = 'going' | 'interested'
type CommunityPostType = 'session' | 'update' | 'conditions' | 'question'

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
const ALLOWED_POST_TYPES = new Set(['session', 'update', 'conditions', 'question'])

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface CommentRow {
  id: string
  author_id: string
  body: string
  created_at: string
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function isValidStatus(status: unknown): status is RsvpStatus {
  return status === 'going' || status === 'interested'
}

async function buildCommentPayload(supabase: Awaited<ReturnType<typeof getServerClient>>, postId: string, viewerId: string | null) {
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

export async function saveCommunityRsvpAction(postId: string, status: RsvpStatus | null): Promise<ActionResult<{ rsvp_counts: { going: number; interested: number }; viewer_rsvp: RsvpStatus | null }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!postId) return { success: false, error: 'Missing post id', status: 400 }
  if (status !== null && !isValidStatus(status)) return { success: false, error: 'Invalid RSVP status', status: 400 }

  const supabase = await getServerClient()
  const { data: post } = await supabase.from('community_posts').select('id, type').eq('id', postId).maybeSingle()
  if (!post || post.type !== 'session') return { success: false, error: 'Session post not found', status: 404 }

  if (status === null) {
    const { error } = await supabase.from('community_post_rsvps').delete().eq('post_id', postId).eq('user_id', auth.data.userId)
    if (error) return { success: false, error: 'Error removing RSVP', status: 500 }
  } else {
    const { error } = await supabase.from('community_post_rsvps').upsert({ post_id: postId, user_id: auth.data.userId, status }, { onConflict: 'post_id,user_id' })
    if (error) return { success: false, error: 'Error updating RSVP', status: 500 }
  }

  const { data: rsvps } = await supabase.from('community_post_rsvps').select('user_id, status').eq('post_id', postId)
  let viewerRsvp: RsvpStatus | null = null
  let goingCount = 0
  let interestedCount = 0

  for (const rsvp of (rsvps || []) as Array<{ user_id: string; status: RsvpStatus }>) {
    if (rsvp.status === 'going') goingCount += 1
    if (rsvp.status === 'interested') interestedCount += 1
    if (rsvp.user_id === auth.data.userId) viewerRsvp = rsvp.status
  }

  return {
    success: true,
    data: {
      rsvp_counts: { going: goingCount, interested: interestedCount },
      viewer_rsvp: viewerRsvp,
    },
  }
}

export async function createCommunityPostAction(input: {
  type?: CommunityPostType
  place_id?: string
  title?: string | null
  body?: string
  discipline?: string | null
  grade_min?: string | null
  grade_max?: string | null
  start_at?: string
  end_at?: string | null
}): Promise<ActionResult<Record<string, unknown>>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const type = input.type || 'session'
  const placeId = input.place_id?.trim()
  const rawBody = input.body?.trim() || ''
  const title = input.title?.trim() || null
  const discipline = input.discipline?.trim() || null
  const gradeMin = input.grade_min?.trim() || null
  const gradeMax = input.grade_max?.trim() || null
  const startAt = parseDate(input.start_at)
  const endAt = parseDate(input.end_at)

  if (!ALLOWED_POST_TYPES.has(type)) return { success: false, error: 'Invalid post type', status: 400 }
  if (!placeId) return { success: false, error: 'place_id is required', status: 400 }
  if (type === 'session' && !startAt) return { success: false, error: 'Valid start_at is required for session posts', status: 400 }
  if (rawBody.length < 1 || rawBody.length > 2000) return { success: false, error: 'body must be between 1 and 2000 characters', status: 400 }
  if (title && title.length > 120) return { success: false, error: 'title must be 120 characters or less', status: 400 }
  if (discipline && !ALLOWED_DISCIPLINES.has(discipline)) return { success: false, error: 'Invalid discipline', status: 400 }
  if (gradeMin && gradeMin.length > 10) return { success: false, error: 'grade_min must be 10 characters or less', status: 400 }
  if (gradeMax && gradeMax.length > 10) return { success: false, error: 'grade_max must be 10 characters or less', status: 400 }
  if (type === 'session' && endAt && startAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
    return { success: false, error: 'end_at must be after start_at', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: place } = await supabase.from('places').select('id').eq('id', placeId).maybeSingle()
  if (!place) return { success: false, error: 'Place not found', status: 404 }

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_id: auth.data.userId,
      place_id: placeId,
      type,
      title,
      body: rawBody,
      discipline,
      grade_min: gradeMin,
      grade_max: gradeMax,
      start_at: type === 'session' ? startAt : null,
      end_at: type === 'session' ? endAt : null,
    })
    .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
    .single()

  if (error || !data) return { success: false, error: 'Error creating community post', status: 500 }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', auth.data.userId)
    .maybeSingle()

  return { success: true, data: { ...data, author: (profile as ProfileRow | null) || null } }
}

export async function createCommunityCommentAction(postId: string, body: string): Promise<ActionResult<{ comments: Awaited<ReturnType<typeof buildCommentPayload>> }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!postId) return { success: false, error: 'Missing post id', status: 400 }

  const trimmedBody = body.trim()
  if (trimmedBody.length < 1 || trimmedBody.length > 2000) {
    return { success: false, error: 'Comment must be between 1 and 2000 characters', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: post } = await supabase.from('community_posts').select('id, type').eq('id', postId).maybeSingle()
  if (!post || post.type !== 'session') return { success: false, error: 'Session post not found', status: 404 }

  const { error } = await supabase.from('community_post_comments').insert({ post_id: postId, author_id: auth.data.userId, body: trimmedBody })
  if (error) return { success: false, error: 'Error posting comment', status: 500 }

  const comments = await buildCommentPayload(supabase, postId, auth.data.userId)
  return { success: true, data: { comments } }
}

export async function deleteCommunityCommentAction(postId: string, commentId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!postId || !commentId) return { success: false, error: 'Missing identifiers', status: 400 }

  const supabase = await getServerClient()
  const { data: comment } = await supabase
    .from('community_post_comments')
    .select('id, post_id, author_id')
    .eq('id', commentId)
    .eq('post_id', postId)
    .maybeSingle()

  if (!comment) return { success: false, error: 'Comment not found', status: 404 }
  if (comment.author_id !== auth.data.userId) return { success: false, error: 'Unauthorized', status: 403 }

  const { error } = await supabase.from('community_post_comments').delete().eq('id', commentId).eq('post_id', postId)
  if (error) return { success: false, error: 'Error deleting comment', status: 500 }

  return { success: true }
}
