import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { withCsrfProtection } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

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

    const body = await request.json()
    const rawTargetType = typeof body?.targetType === 'string' ? body.targetType : null
    const rawTargetId = typeof body?.targetId === 'string' ? body.targetId : null
    const rawCommentBody = typeof body?.body === 'string' ? body.body : ''
    const rawCategory = typeof body?.category === 'string' ? body.category : getDefaultCategory(rawTargetType || 'climb')

    if (!isValidTargetType(rawTargetType)) {
      return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 })
    }

    if (!rawTargetId) {
      return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
    }

    if (!isValidCategoryForTarget(rawTargetType, rawCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const trimmedBody = rawCommentBody.trim()
    if (!trimmedBody) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 })
    }

    if (trimmedBody.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json({ error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` }, { status: 400 })
    }

    const targetTable = rawTargetType === 'crag' ? 'crags' : rawTargetType === 'image' ? 'images' : 'climbs'
    const { data: target, error: targetError } = await supabase
      .from(targetTable)
      .select('id')
      .eq('id', rawTargetId)
      .single()

    if (targetError || !target) {
      return NextResponse.json({ error: `${rawTargetType} not found` }, { status: 404 })
    }

    const { data: insertedComment, error: insertError } = await supabase
      .from('comments')
      .insert({
        target_type: rawTargetType,
        target_id: rawTargetId,
        author_id: userId,
        body: trimmedBody,
        category: rawCategory,
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
