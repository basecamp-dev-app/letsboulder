import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { parseWithSchema } from '@/lib/api-validation'
import type { Database, Json } from '@/types/database'
import { isValidGrade } from '@/lib/grade-constants'

type ClimbCorrectionInsert = Database['public']['Tables']['climb_corrections']['Insert']

const correctionReasonSchema = z.string().optional()
const climbCorrectionSchema = z.discriminatedUnion('correction_type', [
  z.object({
    correction_type: z.literal('location'),
    suggested_value: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
    reason: correctionReasonSchema,
  }),
  z.object({
    correction_type: z.literal('name'),
    suggested_value: z.object({ name: z.string().trim().min(1) }),
    reason: correctionReasonSchema,
  }),
  z.object({
    correction_type: z.literal('grade'),
    suggested_value: z.object({ grade: z.string().refine(isValidGrade, 'Invalid grade') }),
    reason: correctionReasonSchema,
  }),
])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase, userId } = middlewareResult

  try {
    const { id: climbId } = await params
    const parsedBody = parseWithSchema(climbCorrectionSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { correction_type, suggested_value, reason } = parsedBody.data

    // Check if climb exists
    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id, name, grade, latitude, longitude')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Get original value based on correction type
    let originalValue: Json | null = null
    switch (correction_type) {
      case 'location':
        originalValue = {
          latitude: climb.latitude,
          longitude: climb.longitude
        }
        break
      case 'name':
        originalValue = { name: climb.name }
        break
      case 'grade':
        originalValue = { grade: climb.grade }
        break
    }

    // Create correction
    const insertData: ClimbCorrectionInsert = {
      climb_id: climbId,
      user_id: userId,
      correction_type,
      original_value: originalValue,
      suggested_value,
      reason: reason || null,
      status: 'pending',
      approval_count: 0,
      rejection_count: 0,
    }

    const { data: correction, error: insertError } = await supabase
      .from('climb_corrections')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      return createErrorResponse(insertError, 'Error creating correction')
    }

    return NextResponse.json({
      success: true,
      correction: {
        id: correction.id,
        climb_id: correction.climb_id,
        correction_type: correction.correction_type,
        status: correction.status,
        approval_count: correction.approval_count,
        rejection_count: correction.rejection_count
      },
      message: 'Correction submitted. Community will review and approve/reject.'
    })
  } catch (error) {
    return createErrorResponse(error, 'Correction error')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerClientFromRequest(request)

  try {
    const { id: climbId } = await params

    // Get corrections for this climb
    const { data: corrections, error } = await supabase
      .from('climb_corrections')
      .select(`
        id,
        climb_id,
        user_id,
        correction_type,
        original_value,
        suggested_value,
        reason,
        status,
        approval_count,
        rejection_count,
        created_at,
        resolved_at
      `)
      .eq('climb_id', climbId)
      .order('created_at', { ascending: false })

    if (error) {
      return createErrorResponse(error, 'Error fetching corrections')
    }

    return NextResponse.json({
      corrections: corrections || [],
      count: corrections?.length || 0
    })
  } catch (error) {
    return createErrorResponse(error, 'Get corrections error')
  }
}
