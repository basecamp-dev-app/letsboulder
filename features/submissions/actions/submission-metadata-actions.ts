'use server'

import { revalidatePath } from 'next/cache'
import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { isValidGrade } from '@/lib/grade-constants'
import { buildConsensusUpdates } from '@/lib/grades/grade-votes'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import { getAdminClient, getServerClient } from '@/lib/supabase-server'

export async function updateSubmissionCreditAction(imageId: string, platformInput: unknown, handleInput: unknown): Promise<ActionResult<{ credit: { platform: string | null; handle: string | null } }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const handle = normalizeSubmissionCreditHandle(handleInput)
  let platform: ReturnType<typeof normalizeSubmissionCreditPlatform> = null
  if (handle) {
    platform = normalizeSubmissionCreditPlatform(platformInput)
    if (!platform) return { success: false, error: 'Valid platform is required when handle is provided', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_own_submission_credit', {
    p_image_id: imageId,
    p_platform: platform,
    p_handle: handle,
  })

  if (rpcError) {
    const message = rpcError.message || ''
    if (message.includes('permission')) return { success: false, error: 'Only the original submitter can edit contribution credit', status: 403 }
    if (message.includes('Image ID is required')) return { success: false, error: 'Image ID is required', status: 400 }
    if (message.includes('Invalid platform') || message.includes('Handle must') || message.includes('Handle can only include')) {
      return { success: false, error: message, status: 400 }
    }
    return { success: false, error: 'Update submission credit error', status: 500 }
  }

  const resultObject = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {}
  return {
    success: true,
    data: {
      credit: {
        platform: typeof resultObject.platform === 'string' ? resultObject.platform : null,
        handle: typeof resultObject.handle === 'string' ? resultObject.handle : null,
      },
    },
  }
}

export async function updateSubmissionAnonymousAction(imageId: string, isAnonymousSubmission: boolean): Promise<ActionResult<{ submission: { isAnonymousSubmission: boolean } }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_own_submission_anonymity', {
    p_image_id: imageId,
    p_is_anonymous: isAnonymousSubmission,
  })

  if (rpcError) {
    const message = rpcError.message || ''
    if (message.includes('permission')) return { success: false, error: 'Only the original submitter can edit anonymity', status: 403 }
    if (message.includes('Image ID is required')) return { success: false, error: 'Image ID is required', status: 400 }
    return { success: false, error: 'Update submission anonymity error', status: 500 }
  }

  const resultObject = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {}
  return { success: true, data: { submission: { isAnonymousSubmission: resultObject.isAnonymousSubmission === true } } }
}

export async function updateSubmissionCragAction(imageId: string, cragName: string, regionTag: string, subArea?: string | null): Promise<ActionResult<{ crag: unknown }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }
  if (!cragName.trim() || !regionTag.trim()) return { success: false, error: 'Invalid payload', status: 400 }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_submission_crag_metadata', {
    p_image_id: imageId,
    p_crag_name: cragName.trim(),
    p_region_tag: regionTag.trim(),
    p_sub_area: typeof subArea === 'string' ? subArea.trim() || null : null,
  })

  if (rpcError) {
    const message = (rpcError.message || '').toLowerCase()
    if (message.includes('owner') || message.includes('permission')) return { success: false, error: 'Only the submission owner can edit crag metadata', status: 403 }
    if (message.includes('not found') || message.includes('required')) return { success: false, error: rpcError.message, status: 400 }
    return { success: false, error: 'Update submission crag metadata error', status: 500 }
  }

  const { data: image } = await supabase.from('images').select('crag_id').eq('id', imageId).single()
  revalidatePath('/')
  if (image?.crag_id) {
    const { data: cragData } = await supabase.from('crags').select('slug, country_code').eq('id', image.crag_id).single()
    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  return { success: true, data: { crag: result } }
}

export async function saveSubmissionGradeVotesAction(imageId: string, grades: Array<{ routeLineId: string; grade: string }>): Promise<ActionResult<{ votesUpdated: number; collaboratorCount: number }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }
  if (!Array.isArray(grades) || grades.length === 0 || grades.some((item) => !item?.routeLineId || !isValidGrade(item.grade))) {
    return { success: false, error: 'A valid grades array is required', status: 400 }
  }

  const supabase = await getServerClient()
  const supabaseAdmin = getAdminClient()
  const { data: image, error: imageError } = await supabase.from('images').select('id, created_by').eq('id', imageId).maybeSingle()
  if (imageError) return { success: false, error: 'Save submission grade votes error', status: 500 }
  if (!image) return { success: false, error: 'Image not found', status: 404 }

  const ownerId = typeof image.created_by === 'string' ? image.created_by : null
  if (!ownerId) return { success: false, error: 'This submission is not editable', status: 403 }

  let hasAccess = ownerId === auth.data.userId
  if (!hasAccess) {
    const { data: collaboratorAccess, error: collaboratorError } = await supabase
      .from('submission_collaborators')
      .select('image_id')
      .eq('image_id', imageId)
      .eq('user_id', auth.data.userId)
      .maybeSingle()
    if (collaboratorError) return { success: false, error: 'Save submission grade votes error', status: 500 }
    hasAccess = !!collaboratorAccess
  }
  if (!hasAccess) return { success: false, error: 'Only the owner or a collaborator can set grade votes', status: 403 }

  const uniqueRouteLineIds = Array.from(new Set(grades.map((item) => item.routeLineId)))
  const { data: routeLines, error: routeLinesError } = await supabase.from('route_lines').select('id, climb_id').eq('image_id', imageId).in('id', uniqueRouteLineIds)
  if (routeLinesError) return { success: false, error: 'Save submission grade votes error', status: 500 }

  const climbIdByRouteLineId = new Map((routeLines || []).map((routeLine) => [routeLine.id, routeLine.climb_id]))
  if (climbIdByRouteLineId.size !== uniqueRouteLineIds.length) {
    return { success: false, error: 'One or more routes are invalid for this submission', status: 400 }
  }

  const { data: collaboratorRows, error: collaboratorsError } = await supabase.from('submission_collaborators').select('user_id').eq('image_id', imageId)
  if (collaboratorsError) return { success: false, error: 'Save submission grade votes error', status: 500 }
  if (!supabaseAdmin) return { success: false, error: 'Service role key missing', status: 500 }

  const voterUserIds = Array.from(new Set([ownerId, ...((collaboratorRows || []).map((row) => row.user_id).filter((id): id is string => typeof id === 'string' && !!id))]))
  const voteRows = grades.flatMap((item) => {
    const climbId = climbIdByRouteLineId.get(item.routeLineId)
    if (!climbId) return []
    return voterUserIds.map((voterUserId) => ({ climb_id: climbId, user_id: voterUserId, grade: item.grade }))
  })

  if (voteRows.length > 0) {
    const { error: upsertError } = await supabaseAdmin.from('grade_votes').upsert(voteRows, { onConflict: 'climb_id,user_id' })
    if (upsertError) return { success: false, error: 'Save submission grade votes error', status: 500 }

    const uniqueClimbIds = Array.from(new Set(voteRows.map((row) => row.climb_id)))
    const { data: gradeVoteRows, error: gradeVoteRowsError } = await supabaseAdmin.from('grade_votes').select('climb_id, grade').in('climb_id', uniqueClimbIds)
    if (gradeVoteRowsError) return { success: false, error: 'Save submission grade votes error', status: 500 }

    const consensusUpdates = buildConsensusUpdates((gradeVoteRows || []) as Array<{ climb_id: string | null; grade: string | null }>)

    if (consensusUpdates.length > 0) {
      const { error: consensusUpdateError } = await supabaseAdmin.from('climbs').upsert(consensusUpdates, { onConflict: 'id' })
      if (consensusUpdateError) return { success: false, error: 'Save submission grade votes error', status: 500 }
    }
  }

  return { success: true, data: { votesUpdated: voteRows.length, collaboratorCount: voterUserIds.length } }
}
