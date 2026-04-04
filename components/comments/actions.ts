'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { reportError } from '@/lib/errors'
import { getServerClient } from '@/lib/supabase-server'
import { z } from 'zod'

type TargetType = 'crag' | 'image' | 'climb'
type CommentCategory =
  | 'history'
  | 'broken_hold'
  | 'beta'
  | 'conditions'
  | 'access'
  | 'approach'
  | 'parking'
  | 'closure'
  | 'general'
  | 'grade'
  | 'fa_history'
  | 'safety'
  | 'gear_protection'
  | 'approach_access'
  | 'descent'
  | 'rock_quality'
  | 'highlights'
  | 'variations'

interface CommentItem {
  id: string
  target_type: TargetType
  target_id: string
  author_id: string | null
  body: string
  category: CommentCategory
  created_at: string
  is_owner: boolean
}

const VALID_TARGET_TYPES = ['crag', 'image', 'climb'] as const
const TARGET_CATEGORY_CONFIG = {
  crag: ['access', 'approach', 'parking', 'closure', 'general'],
  image: ['beta', 'fa_history', 'safety', 'gear_protection', 'conditions', 'approach_access', 'descent', 'rock_quality', 'highlights', 'variations'],
  climb: ['beta', 'broken_hold', 'conditions', 'grade', 'history'],
} as const
const MAX_COMMENT_LENGTH = 2000

function isValidCategoryForTarget(targetType: TargetType, value: string | null): value is CommentCategory {
  if (!value) return false
  return (TARGET_CATEGORY_CONFIG[targetType] as readonly string[]).includes(value)
}

function getDefaultCategory(targetType: TargetType): CommentCategory {
  return TARGET_CATEGORY_CONFIG[targetType][0]
}

interface CreateCommentInput {
  targetType: string
  targetId: string
  body: string
  category?: string
}

const createCommentSchema = z.object({
  targetType: z.enum(VALID_TARGET_TYPES),
  targetId: z.string().trim().min(1, 'targetId is required'),
  body: z.string().trim().min(1, 'Comment cannot be empty').max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or less`),
  category: z.string().optional(),
})

const deleteCommentSchema = z.object({
  commentId: z.string().trim().min(1, 'Comment ID required'),
})

export async function createCommentAction(input: CreateCommentInput): Promise<ActionResult<{ comment: CommentItem }>> {
  const validation = validateActionInput(createCommentSchema, input)
  if (!validation.success) return fail<{ comment: CommentItem }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const rawTargetType = validation.data.targetType
  const rawTargetId = validation.data.targetId
  const trimmedBody = validation.data.body
  const rawCategory = typeof validation.data.category === 'string' ? validation.data.category : getDefaultCategory(rawTargetType)

  if (!isValidCategoryForTarget(rawTargetType, rawCategory)) {
    return { success: false, error: 'Invalid category', status: 400 }
  }

  const supabase = await getServerClient()
  const targetTable = rawTargetType === 'crag' ? 'crags' : rawTargetType === 'image' ? 'images' : 'climbs'
  const { data: target, error: targetError } = await supabase
    .from(targetTable)
    .select('id')
    .eq('id', rawTargetId)
    .single()

  if (targetError || !target) {
    return { success: false, error: `${rawTargetType} not found`, status: 404 }
  }

  const { data: insertedComment, error: insertError } = await supabase
    .from('comments')
    .insert({
      target_type: rawTargetType,
      target_id: rawTargetId,
      author_id: auth.data.userId,
      body: trimmedBody,
      category: rawCategory,
    })
    .select('id, target_type, target_id, author_id, body, category, created_at')
    .single()

  if (insertError || !insertedComment) {
    reportError(insertError as Error, { message: 'Error creating comment' })
    return { success: false, error: 'Error creating comment', status: 500 }
  }

  return ok({
    comment: {
      ...insertedComment,
      is_owner: true,
    },
  })
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult<{ id: string }>> {
  const validation = validateActionInput(deleteCommentSchema, { commentId })
  if (!validation.success) return fail<{ id: string }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  const supabase = await getServerClient()
  const { data: deleted, error } = await supabase.rpc('soft_delete_comment', {
    p_comment_id: validation.data.commentId,
  })

  if (error) {
    reportError(error as Error, { message: 'Error deleting comment' })
    return { success: false, error: 'Error deleting comment', status: 500 }
  }

  if (!deleted) {
    return { success: false, error: 'Comment not found', status: 404 }
  }

  return ok({ id: validation.data.commentId })
}
