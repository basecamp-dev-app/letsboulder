'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import { z } from 'zod'

type RsvpStatus = 'going' | 'interested'
type CommunityPostType = 'session' | 'update' | 'conditions' | 'question'

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])

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

const saveCommunityRsvpSchema = z.object({
  postId: z.string().trim().min(1, 'Missing post id'),
  status: z.enum(['going', 'interested']).nullable(),
})

const createCommunityPostSchema = z.object({
  type: z.enum(['session', 'update', 'conditions', 'question']).optional().default('session'),
  place_id: z.string().trim().min(1, 'place_id is required'),
  title: z.string().trim().max(120, 'title must be 120 characters or less').nullable().optional(),
  body: z.string().trim().min(1, 'body must be between 1 and 2000 characters').max(2000, 'body must be between 1 and 2000 characters'),
  discipline: z.string().trim().nullable().optional(),
  grade_min: z.string().trim().max(10, 'grade_min must be 10 characters or less').nullable().optional(),
  grade_max: z.string().trim().max(10, 'grade_max must be 10 characters or less').nullable().optional(),
  start_at: z.string().optional(),
  end_at: z.string().nullable().optional(),
})

const createCommunityCommentSchema = z.object({
  postId: z.string().trim().min(1, 'Missing post id'),
  body: z.string().trim().min(1, 'Comment must be between 1 and 2000 characters').max(2000, 'Comment must be between 1 and 2000 characters'),
})

const deleteCommunityCommentSchema = z.object({
  postId: z.string().trim().min(1, 'Missing identifiers'),
  commentId: z.string().trim().min(1, 'Missing identifiers'),
})

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
  const validation = validateActionInput(saveCommunityRsvpSchema, { postId, status })
  if (!validation.success) return fail(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  const { postId: validatedPostId, status: validatedStatus } = validation.data

  const supabase = await getServerClient()
  const { data: post } = await supabase.from('community_posts').select('id, type').eq('id', validatedPostId).maybeSingle()
  if (!post || post.type !== 'session') return { success: false, error: 'Session post not found', status: 404 }

  if (validatedStatus === null) {
    const { error } = await supabase.from('community_post_rsvps').delete().eq('post_id', validatedPostId).eq('user_id', auth.data.userId)
    if (error) return { success: false, error: 'Error removing RSVP', status: 500 }
  } else {
    const { error } = await supabase.from('community_post_rsvps').upsert({ post_id: validatedPostId, user_id: auth.data.userId, status: validatedStatus }, { onConflict: 'post_id,user_id' })
    if (error) return { success: false, error: 'Error updating RSVP', status: 500 }
  }

  const { data: rsvpCounts, error: rsvpCountsError } = await supabase
    .from('community_post_rsvp_counts')
    .select('going_count, interested_count')
    .eq('post_id', validatedPostId)
    .maybeSingle()
  if (rsvpCountsError) return { success: false, error: 'Error loading RSVP counts', status: 500 }

  return {
    success: true,
    data: {
      rsvp_counts: {
        going: rsvpCounts?.going_count ?? 0,
        interested: rsvpCounts?.interested_count ?? 0,
      },
      viewer_rsvp: validatedStatus,
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
  const validation = validateActionInput(createCommunityPostSchema, input)
  if (!validation.success) {
    return fail<Record<string, unknown>>(
      validation.result.error || 'Invalid request data',
      validation.result.status || 400,
      validation.result.fieldErrors
    )
  }

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const type = validation.data.type
  const placeId = validation.data.place_id
  const rawBody = validation.data.body
  const title = validation.data.title || null
  const discipline = validation.data.discipline || null
  const gradeMin = validation.data.grade_min || null
  const gradeMax = validation.data.grade_max || null
  const startAt = parseDate(validation.data.start_at)
  const endAt = parseDate(validation.data.end_at)

  if (type === 'session' && !startAt) {
    return {
      success: false,
      error: 'Valid start_at is required for session posts',
      status: 400,
      fieldErrors: {
        start_at: ['Valid start_at is required for session posts'],
      },
    }
  }
  if (discipline && !ALLOWED_DISCIPLINES.has(discipline)) {
    return {
      success: false,
      error: 'Invalid discipline',
      status: 400,
      fieldErrors: {
        discipline: ['Invalid discipline'],
      },
    }
  }
  if (type === 'session' && endAt && startAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
    return {
      success: false,
      error: 'end_at must be after start_at',
      status: 400,
      fieldErrors: {
        end_at: ['end_at must be after start_at'],
      },
    }
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
  const validation = validateActionInput(createCommunityCommentSchema, { postId, body })
  if (!validation.success) {
    return fail(
      validation.result.error || 'Invalid request data',
      validation.result.status || 400,
      validation.result.fieldErrors
    )
  }

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  const { postId: validatedPostId, body: trimmedBody } = validation.data

  const supabase = await getServerClient()
  const { data: post } = await supabase.from('community_posts').select('id, type').eq('id', validatedPostId).maybeSingle()
  if (!post || post.type !== 'session') return { success: false, error: 'Session post not found', status: 404 }

  const { error } = await supabase.from('community_post_comments').insert({ post_id: validatedPostId, author_id: auth.data.userId, body: trimmedBody })
  if (error) return { success: false, error: 'Error posting comment', status: 500 }

  const comments = await buildCommentPayload(supabase, validatedPostId, auth.data.userId)
  return { success: true, data: { comments } }
}

export async function deleteCommunityCommentAction(postId: string, commentId: string): Promise<ActionResult> {
  const validation = validateActionInput(deleteCommunityCommentSchema, { postId, commentId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  const { postId: validatedPostId, commentId: validatedCommentId } = validation.data

  const supabase = await getServerClient()
  const { data: comment } = await supabase
    .from('community_post_comments')
    .select('id, post_id, author_id')
    .eq('id', validatedCommentId)
    .eq('post_id', validatedPostId)
    .maybeSingle()

  if (!comment) return { success: false, error: 'Comment not found', status: 404 }
  if (comment.author_id !== auth.data.userId) return { success: false, error: 'Unauthorized', status: 403 }

  const { error } = await supabase.from('community_post_comments').delete().eq('id', validatedCommentId).eq('post_id', validatedPostId)
  if (error) return { success: false, error: 'Error deleting comment', status: 500 }

  return { success: true }
}
