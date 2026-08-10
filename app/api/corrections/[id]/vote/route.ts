import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'
import { recordCorrectionApprovedEvent } from '@/features/community/lib/contributor-score'

const correctionVoteSchema = z.object({
  vote_type: z.enum(['approve', 'reject']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult

  try {
    const { id: correctionId } = await params
    const parsedBody = parseWithSchema(correctionVoteSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const { data, error } = await supabase.rpc('vote_on_climb_correction', {
      p_correction_id: correctionId,
      p_vote_type: parsedBody.data.vote_type,
    })
    if (error) return createErrorResponse(error, 'Correction vote error')

    const result = data?.[0]
    if (!result) {
      return createErrorResponse(new Error('Correction vote result missing'), 'Correction vote error')
    }

    if (result.status === 'approved') {
      const { data: correction, error: correctionError } = await supabase
        .from('climb_corrections')
        .select('climb_id')
        .eq('id', correctionId)
        .single()
      if (correctionError || !correction) {
        return createErrorResponse(correctionError ?? new Error('Approved correction not found'), 'Apply correction error')
      }
      await applyCorrection(correctionId, correction.climb_id)
    }

    let message = result.vote_action === 'changed'
      ? `Vote changed to ${parsedBody.data.vote_type}`
      : `Voted to ${parsedBody.data.vote_type}`
    if (result.status === 'approved') {
      message = 'Correction approved! Changes have been applied.'
    } else if (result.status === 'rejected') {
      message = 'Correction rejected by the community.'
    }

    return NextResponse.json({
      success: true,
      approval_count: result.approval_count,
      rejection_count: result.rejection_count,
      status: result.status,
      message,
    })
  } catch (error) {
    return createErrorResponse(error, 'Correction vote error')
  }
}

async function applyCorrection(correctionId: string, climbId: string) {
  const supabase = getAdminClientWithAudit('apply community-approved climb correction')
  const { data: correction, error: correctionError } = await supabase
    .from('climb_corrections')
    .select('correction_type, suggested_value')
    .eq('id', correctionId)
    .single()
  if (correctionError) throw correctionError
  if (!correction) throw new Error('Approved correction not found')

  const updateData: Record<string, unknown> = {}
  switch (correction.correction_type) {
    case 'name':
      updateData.name = correction.suggested_value.name
      break
    case 'grade':
      updateData.grade = correction.suggested_value.grade
      break
    case 'location':
      updateData.latitude = correction.suggested_value.latitude
      updateData.longitude = correction.suggested_value.longitude
      break
  }

  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase.from('climbs').update(updateData).eq('id', climbId)
    if (error) throw error
  }

  const { error: resetError } = await supabase
    .from('climbs')
    .update({ status: 'pending' })
    .eq('id', climbId)
  if (resetError) throw resetError

  await recordCorrectionApprovedEvent(correctionId)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  try {
    const { id: correctionId } = await params
    const { error } = await middlewareResult.supabase.rpc('vote_on_climb_correction', {
      p_correction_id: correctionId,
    })
    if (error) return createErrorResponse(error, 'Remove vote error')
    return NextResponse.json({ success: true, message: 'Vote removed' })
  } catch (error) {
    return createErrorResponse(error, 'Remove vote error')
  }
}
