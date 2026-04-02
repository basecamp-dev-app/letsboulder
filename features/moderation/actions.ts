'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { getActionAuth } from '@/lib/actions/action-auth'
import { notifyNewFlag } from '@/lib/discord'
import { getServerClient } from '@/lib/supabase-server'

const VALID_FLAG_TYPES = ['location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other']
const MAX_COMMENT_LENGTH = 250
const DEFAULT_FLAG_TYPE = 'other'
const DEFAULT_COMMENT = 'Flagged for admin review'

export async function submitImageFlagAction(imageId: string, flagType: string, comment: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID required', status: 400 }
  if (!flagType || !VALID_FLAG_TYPES.includes(flagType)) return { success: false, error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`, status: 400 }

  const trimmedComment = comment?.trim() || ''
  if (trimmedComment.length < 10) return { success: false, error: 'Comment must be at least 10 characters', status: 400 }
  if (trimmedComment.length > MAX_COMMENT_LENGTH) return { success: false, error: `Comment must be ${MAX_COMMENT_LENGTH} characters or less`, status: 400 }

  const supabase = await getServerClient()
  const { data: image, error: imageError } = await supabase.from('images').select('id, crag_id').eq('id', imageId).single()
  if (imageError || !image) return { success: false, error: 'Image not found', status: 404 }

  const { data: existingFlag, error: checkError } = await supabase
    .from('climb_flags')
    .select('id, status')
    .eq('image_id', imageId)
    .eq('flagger_id', auth.data.userId)
    .eq('status', 'pending')
    .single()

  if (checkError && checkError.code !== 'PGRST116') return { success: false, error: 'Error checking existing flag', status: 500 }
  if (existingFlag) return { success: false, error: 'You have already flagged this image. It is being reviewed.', status: 400 }

  const { error: flagError } = await supabase.from('climb_flags').insert({
    image_id: imageId,
    crag_id: image.crag_id,
    climb_id: null,
    flagger_id: auth.data.userId,
    flag_type: flagType,
    comment: trimmedComment,
    status: 'pending',
  })

  if (flagError) return { success: false, error: 'Error creating flag', status: 500 }

  const { data: cragData } = await supabase.from('crags').select('name').eq('id', image.crag_id).single()
  await notifyNewFlag(supabase, {
    type: 'image',
    flagType,
    cragName: cragData?.name || 'Unknown Crag',
    cragId: image.crag_id,
    comment: trimmedComment,
    flaggerId: auth.data.userId,
  }).catch(err => console.error('Discord notification error:', err))

  return { success: true }
}

export async function submitClimbFlagAction(climbId: string, flagType: string, comment: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!climbId) return { success: false, error: 'Climb ID required', status: 400 }
  if (!flagType || !VALID_FLAG_TYPES.includes(flagType)) return { success: false, error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`, status: 400 }

  const trimmedComment = comment.trim()
  if (!trimmedComment || trimmedComment.length < 10) return { success: false, error: 'Comment must be at least 10 characters', status: 400 }

  const supabase = await getServerClient()
  const { data: climb, error: climbError } = await supabase
    .from('climbs')
    .select('id, name, grade, crag_id, user_id, deleted_at, crag:crag_id(id, name)')
    .eq('id', climbId)
    .single()

  if (climbError || !climb) return { success: false, error: 'Climb not found', status: 404 }
  if (climb.deleted_at) return { success: false, error: 'This climb has already been removed', status: 400 }

  const { data: existingFlag } = await supabase
    .from('climb_flags')
    .select('id, status')
    .eq('climb_id', climbId)
    .eq('flagger_id', auth.data.userId)
    .eq('status', 'pending')
    .single()

  if (existingFlag) return { success: false, error: 'You have already flagged this climb. It is being reviewed.', status: 400 }

  const { error: flagError } = await supabase.from('climb_flags').insert({
    climb_id: climbId,
    crag_id: climb.crag_id,
    flagger_id: auth.data.userId,
    flag_type: flagType,
    comment: trimmedComment,
    status: 'pending',
  })

  if (flagError) return { success: false, error: 'Error creating flag', status: 500 }

  const cragName = Array.isArray(climb.crag) ? climb.crag[0]?.name : (climb.crag as unknown as { name: string })?.name || 'Unknown Crag'
  await notifyNewFlag(supabase, {
    type: 'climb',
    flagType,
    targetName: climb.name,
    cragName,
    cragId: climb.crag_id,
    comment: trimmedComment,
    flaggerId: auth.data.userId,
  }).catch(err => console.error('Discord notification error:', err))

  return { success: true }
}

export async function submitCragFlagAction(cragId: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!cragId) return { success: false, error: 'Crag ID required', status: 400 }

  const supabase = await getServerClient()
  const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', auth.data.userId).single()
  if (profileError || !profile?.is_admin) return { success: false, error: 'Admin access required to flag crags', status: 403 }

  const { data: crag, error: cragError } = await supabase.from('crags').select('id, name').eq('id', cragId).single()
  if (cragError || !crag) return { success: false, error: 'Crag not found', status: 404 }

  const { data: existingFlag, error: checkError } = await supabase
    .from('climb_flags')
    .select('id, status')
    .eq('crag_id', cragId)
    .eq('flagger_id', auth.data.userId)
    .eq('status', 'pending')
    .single()

  if (checkError && checkError.code !== 'PGRST116') return { success: false, error: 'Error checking existing flag', status: 500 }
  if (existingFlag) return { success: false, error: 'You have already flagged this crag. It is being reviewed.', status: 400 }

  const { error: flagError } = await supabase.from('climb_flags').insert({
    crag_id: cragId,
    climb_id: null,
    image_id: null,
    flagger_id: auth.data.userId,
    flag_type: DEFAULT_FLAG_TYPE,
    comment: DEFAULT_COMMENT,
    status: 'pending',
  })

  if (flagError) return { success: false, error: 'Error creating flag', status: 500 }

  await notifyNewFlag(supabase, {
    type: 'crag',
    flagType: DEFAULT_FLAG_TYPE,
    cragName: crag.name,
    cragId: crag.id,
    comment: DEFAULT_COMMENT,
    flaggerId: auth.data.userId,
  }).catch(err => console.error('Discord notification error:', err))

  return { success: true }
}

export async function submitCragReportAction(cragId: string, reason: string): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!cragId || !reason) return { success: false, error: 'Crag ID and reason are required', status: 400 }
  if (reason.length < 10) return { success: false, error: 'Please provide more detail about why you are reporting this crag', status: 400 }

  const supabase = await getServerClient()
  const { error: reportError } = await supabase.from('crag_reports').insert({
    crag_id: cragId,
    reason,
    status: 'pending',
    reporter_id: auth.data.userId,
  })

  if (reportError) return { success: false, error: 'Error creating report', status: 500 }

  const { data: crag } = await supabase.from('crags').select('report_count').eq('id', cragId).single()
  const newCount = (crag?.report_count || 0) + 1
  await supabase.from('crags').update({ report_count: newCount }).eq('id', cragId)

  return { success: true }
}
