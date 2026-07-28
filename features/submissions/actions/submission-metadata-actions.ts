'use server'

import { revalidatePath } from 'next/cache'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { isValidGrade } from '@/lib/grade-constants'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import { assessNonOwnerTextRisk, combineRiskAssessments } from '@/features/submissions/server/submissions/wiki-edit-protection'
import { getServerClient } from '@/lib/supabase-server'
import { z } from 'zod'

const submissionCreditSchema = z.object({
  imageId: z.string().trim().min(1, 'Image ID is required'),
  platformInput: z.unknown(),
  handleInput: z.unknown(),
})

const submissionAnonymousSchema = z.object({
  imageId: z.string().trim().min(1, 'Image ID is required'),
  isAnonymousSubmission: z.boolean(),
})

const submissionCragSchema = z.object({
  imageId: z.string().trim().min(1, 'Image ID is required'),
  cragName: z.string().trim().min(1, 'Invalid payload'),
  regionTag: z.string().trim().min(1, 'Invalid payload'),
  subArea: z.string().nullable().optional(),
})

const submissionGradeVotesSchema = z.object({
  imageId: z.string().trim().min(1, 'Image ID is required'),
  grades: z.array(z.object({
    routeLineId: z.string().trim().min(1),
    grade: z.string().refine((value) => isValidGrade(value)),
  })).min(1, 'A valid grades array is required'),
})

export async function updateSubmissionCreditAction(imageId: string, platformInput: unknown, handleInput: unknown): Promise<ActionResult<{ credit: { platform: string | null; handle: string | null } }>> {
  const validation = validateActionInput(submissionCreditSchema, { imageId, platformInput, handleInput })
  if (!validation.success) return fail<{ credit: { platform: string | null; handle: string | null } }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const handle = normalizeSubmissionCreditHandle(validation.data.handleInput)
  let platform: ReturnType<typeof normalizeSubmissionCreditPlatform> = null
  if (handle) {
    platform = normalizeSubmissionCreditPlatform(validation.data.platformInput)
    if (!platform) return { success: false, error: 'Valid platform is required when handle is provided', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_own_submission_credit', {
    p_image_id: validation.data.imageId,
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
  const validation = validateActionInput(submissionAnonymousSchema, { imageId, isAnonymousSubmission })
  if (!validation.success) return fail<{ submission: { isAnonymousSubmission: boolean } }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_own_submission_anonymity', {
    p_image_id: validation.data.imageId,
    p_is_anonymous: validation.data.isAnonymousSubmission,
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
  const validation = validateActionInput(submissionCragSchema, { imageId, cragName, regionTag, subArea })
  if (!validation.success) return fail<{ crag: unknown }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data: imageOwner } = await supabase.from('images').select('created_by, crag_id').eq('id', validation.data.imageId).maybeSingle()
  const ownerId = typeof imageOwner?.created_by === 'string' ? imageOwner.created_by : null

  if (ownerId && ownerId !== auth.data.userId && typeof imageOwner?.crag_id === 'string') {
    const { data: existingCrag } = await supabase.from('crags').select('name, region_name, sub_area').eq('id', imageOwner.crag_id).maybeSingle()
    if (existingCrag) {
      const risk = combineRiskAssessments([
        assessNonOwnerTextRisk({ field: 'crag_name', previousValue: existingCrag.name, nextValue: validation.data.cragName }),
        assessNonOwnerTextRisk({ field: 'region_tag', previousValue: existingCrag.region_name, nextValue: validation.data.regionTag }),
        assessNonOwnerTextRisk({ field: 'sub_area', previousValue: existingCrag.sub_area, nextValue: typeof validation.data.subArea === 'string' ? validation.data.subArea.trim() || null : null }),
      ])

      if (risk.riskLevel === 'high_risk') {
        await supabase.rpc('log_submission_edit', {
          p_image_id: validation.data.imageId,
          p_edited_by: auth.data.userId,
          p_edit_kind: 'crag_metadata_update_blocked',
          p_summary: `Blocked risky crag metadata update for "${existingCrag.name || validation.data.cragName}"`,
          p_before_data: existingCrag,
          p_after_data: {
            name: validation.data.cragName,
            region_tag: validation.data.regionTag,
            sub_area: typeof validation.data.subArea === 'string' ? validation.data.subArea.trim() || null : null,
          },
          p_risk_level: risk.riskLevel,
          p_moderation_state: risk.moderationState,
          p_risk_reasons: risk.reasons,
          p_field_targets: risk.fieldTargets,
        })

        return { success: false, error: 'This edit was blocked because it removes too much value from the crag metadata.', status: 403 }
      }
    }
  }

  const { data: result, error: rpcError } = await supabase.rpc('update_submission_crag_metadata', {
    p_image_id: validation.data.imageId,
    p_crag_name: validation.data.cragName,
    p_region_tag: validation.data.regionTag,
    p_sub_area: typeof validation.data.subArea === 'string' ? validation.data.subArea.trim() || null : null,
  })

  if (rpcError) {
    const message = (rpcError.message || '').toLowerCase()
    if (message.includes('owner') || message.includes('permission')) return { success: false, error: 'You do not have permission to edit crag metadata for this submission', status: 403 }
    if (message.includes('not found') || message.includes('required')) return { success: false, error: rpcError.message, status: 400 }
    return { success: false, error: 'Update submission crag metadata error', status: 500 }
  }

  const { data: image } = await supabase.from('images').select('crag_id').eq('id', validation.data.imageId).single()
  revalidatePath('/')
  if (image?.crag_id) {
    const { data: cragData } = await supabase.from('crags').select('slug, country_code').eq('id', image.crag_id).single()
    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  if (ownerId && ownerId !== auth.data.userId && result && typeof result === 'object' && imageOwner?.crag_id) {
    const { data: existingCrag } = await supabase.from('crags').select('name, region_name, sub_area').eq('id', imageOwner.crag_id).maybeSingle()
    const risk = combineRiskAssessments([
      assessNonOwnerTextRisk({ field: 'crag_name', previousValue: existingCrag?.name || null, nextValue: validation.data.cragName }),
      assessNonOwnerTextRisk({ field: 'region_tag', previousValue: existingCrag?.region_name || null, nextValue: validation.data.regionTag }),
      assessNonOwnerTextRisk({ field: 'sub_area', previousValue: existingCrag?.sub_area || null, nextValue: typeof validation.data.subArea === 'string' ? validation.data.subArea.trim() || null : null }),
    ])

    if (risk.riskLevel === 'suspicious') {
      await supabase.rpc('log_submission_edit', {
        p_image_id: validation.data.imageId,
        p_edited_by: auth.data.userId,
        p_edit_kind: 'crag_metadata_flagged',
        p_summary: `Flagged crag metadata update for "${validation.data.cragName}"`,
        p_before_data: existingCrag,
        p_after_data: result,
        p_risk_level: risk.riskLevel,
        p_moderation_state: risk.moderationState,
        p_risk_reasons: risk.reasons,
        p_field_targets: risk.fieldTargets,
      })
    }
  }

  return { success: true, data: { crag: result } }
}

export async function saveSubmissionGradeVotesAction(imageId: string, grades: Array<{ routeLineId: string; grade: string }>): Promise<ActionResult<{ votesUpdated: number }>> {
  const validation = validateActionInput(submissionGradeVotesSchema, { imageId, grades })
  if (!validation.success) return fail<{ votesUpdated: number }>(validation.result.error || 'A valid grades array is required', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data: votesUpdated, error: rpcError } = await supabase.rpc('save_submission_grade_votes', {
    p_image_id: validation.data.imageId,
    p_grades: validation.data.grades,
  })
  if (rpcError) {
    if (rpcError.code === '42501') return { success: false, error: 'You do not have permission to update route grades for this submission', status: 403 }
    if (rpcError.code === 'P0002') return { success: false, error: 'Image not found', status: 404 }
    if (rpcError.code === '22023' || rpcError.code === '22P02') return { success: false, error: rpcError.message, status: 400 }
    return { success: false, error: 'Save submission grade votes error', status: 500 }
  }

  return { success: true, data: { votesUpdated: votesUpdated || 0 } }
}
