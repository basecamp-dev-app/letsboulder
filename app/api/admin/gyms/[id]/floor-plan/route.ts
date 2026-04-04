import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'
import { requireAdmin } from '@/features/admin/server'

const saveFloorPlanSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  image_url: z.string().trim().min(1, 'image_url is required'),
  image_width: z.number().positive('image_width must be a positive number'),
  image_height: z.number().positive('image_height must be a positive number'),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!
  const { supabase } = admin.context

  const { id: gymId } = await params

  try {
    const { data: floorPlan, error } = await supabase
      .from('gym_floor_plans')
      .select('id, gym_place_id, name, image_url, image_width, image_height, is_active, created_at')
      .eq('gym_place_id', gymId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) return createErrorResponse(error, 'Failed to load floor plan')
    return NextResponse.json({ floor_plan: floorPlan || null })
  } catch (error) {
    return createErrorResponse(error, 'Failed to load floor plan')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!
  const { supabase } = admin.context

  const { id: gymId } = await params

  try {
    const parsedBody = parseWithSchema(saveFloorPlanSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const { name, image_url: imageUrl, image_width: imageWidth, image_height: imageHeight } = parsedBody.data

    const { data: gymPlace } = await supabase
      .from('places')
      .select('id, type')
      .eq('id', gymId)
      .eq('type', 'gym')
      .maybeSingle()

    if (!gymPlace) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    const { error: deactivateError } = await supabase
      .from('gym_floor_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('gym_place_id', gymId)
      .eq('is_active', true)

    if (deactivateError) return createErrorResponse(deactivateError, 'Failed to deactivate previous floor plan')

    const { data: createdPlan, error: createError } = await supabase
      .from('gym_floor_plans')
      .insert({
        gym_place_id: gymId,
        name,
        image_url: imageUrl,
        image_width: imageWidth,
        image_height: imageHeight,
        is_active: true,
      })
      .select('id, gym_place_id, name, image_url, image_width, image_height, is_active, created_at')
      .single()

    if (createError) return createErrorResponse(createError, 'Failed to save floor plan')

    return NextResponse.json({ floor_plan: createdPlan }, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Failed to save floor plan')
  }
}
