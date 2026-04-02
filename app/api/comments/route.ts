import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

const VALID_TARGET_TYPES = ['crag', 'image', 'climb'] as const
const TARGET_CATEGORY_CONFIG = {
  crag: ['access', 'approach', 'parking', 'closure', 'general'],
  image: [
    'beta',
    'fa_history',
    'safety',
    'gear_protection',
    'conditions',
    'approach_access',
    'descent',
    'rock_quality',
    'highlights',
    'variations',
  ],
  climb: ['beta', 'broken_hold', 'conditions', 'grade', 'history'],
} as const
const MAX_COMMENT_LENGTH = 2000
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type TargetType = typeof VALID_TARGET_TYPES[number]
type CommentCategory = typeof TARGET_CATEGORY_CONFIG[TargetType][number]
type CategoryFilter = CommentCategory | 'all'

interface CommentRow {
  id: string
  target_type: TargetType
  target_id: string
  author_id: string | null
  body: string
  category: CommentCategory
  created_at: string
}

function isValidTargetType(value: string | null): value is TargetType {
  return !!value && VALID_TARGET_TYPES.includes(value as TargetType)
}

function isValidCategoryForTarget(targetType: TargetType, value: string | null): value is CommentCategory {
  if (!value) return false
  return (TARGET_CATEGORY_CONFIG[targetType] as readonly string[]).includes(value)
}

function getDefaultCategory(targetType: TargetType): CommentCategory {
  return TARGET_CATEGORY_CONFIG[targetType][0]
}

function normalizeLimit(rawLimit: string | null): number {
  const parsed = Number.parseInt(rawLimit || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function normalizeOffset(rawOffset: string | null): number {
  const parsed = Number.parseInt(rawOffset || '', 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function getSupabase(request: NextRequest) {
  return getServerClientFromRequest(request)
}

const createCommentSchema = z.object({
  targetType: z.enum(VALID_TARGET_TYPES),
  targetId: z.string().trim().min(1, 'targetId is required'),
  body: z.string().trim().min(1, 'Comment cannot be empty').max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or less`),
  category: z.string().optional(),
}).superRefine((value, ctx) => {
  const category = value.category ?? getDefaultCategory(value.targetType)

  if (!isValidCategoryForTarget(value.targetType, category)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['category'],
      message: 'Invalid category',
    })
  }
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const targetType = searchParams.get('targetType')
  const targetId = searchParams.get('targetId')
  const category = (searchParams.get('category') || 'all') as CategoryFilter
  const limit = normalizeLimit(searchParams.get('limit'))
  const offset = normalizeOffset(searchParams.get('offset'))

  if (!isValidTargetType(targetType)) {
    return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 })
  }

  if (!targetId) {
    return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
  }

  if (category !== 'all' && !isValidCategoryForTarget(targetType, category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const supabase = getSupabase(request)

  try {
    const { userId: currentUserId } = await resolveUserIdWithFallback(request, supabase)

    let query = supabase
      .from('comments')
      .select('id, target_type, target_id, author_id, body, category, created_at')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category !== 'all') {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      return createErrorResponse(error, 'Error fetching comments')
    }

    const comments = ((data || []) as CommentRow[]).map((comment) => ({
      id: comment.id,
      target_type: comment.target_type,
      target_id: comment.target_id,
      author_id: comment.author_id,
      body: comment.body,
      category: comment.category,
      created_at: comment.created_at,
      is_owner: currentUserId ? comment.author_id === currentUserId : false,
    }))

    return NextResponse.json({
      comments,
      nextOffset: comments.length < limit ? null : offset + comments.length,
    })
  } catch (error) {
    return createErrorResponse(error, 'Comments GET error')
  }
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const parsedBody = parseWithSchema(createCommentSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const category = body.category ?? getDefaultCategory(body.targetType)
    const targetTable = body.targetType === 'crag' ? 'crags' : body.targetType === 'image' ? 'images' : 'climbs'
    const { data: target, error: targetError } = await supabase
      .from(targetTable)
      .select('id')
      .eq('id', body.targetId)
      .single()

    if (targetError || !target) {
      return NextResponse.json({ error: `${body.targetType} not found` }, { status: 404 })
    }

    const { data: insertedComment, error: insertError } = await supabase
      .from('comments')
      .insert({
        target_type: body.targetType,
        target_id: body.targetId,
        author_id: userId,
        body: body.body,
        category,
      })
      .select('id, target_type, target_id, author_id, body, category, created_at')
      .single()

    if (insertError || !insertedComment) {
      return createErrorResponse(insertError, 'Error creating comment')
    }

    return NextResponse.json({
      success: true,
      comment: {
        ...insertedComment,
        is_owner: true,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Comments POST error')
  }
}
