import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getActiveFloorPlan, saveFloorPlan } from '@/features/admin/gyms/server/floor-plans'
import { requireAdmin } from '@/features/admin/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'

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
    const { data: floorPlan, error } = await getActiveFloorPlan(supabase, gymId)

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

    const result = await saveFloorPlan(supabase, {
      gymId,
      name,
      imageUrl,
      imageWidth,
      imageHeight,
    })

    if (result.notFound) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    if (result.error) return createErrorResponse(result.error, 'Failed to save floor plan')

    return NextResponse.json({ floor_plan: result.floorPlan }, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Failed to save floor plan')
  }
}
