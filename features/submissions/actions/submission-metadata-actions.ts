'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
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
