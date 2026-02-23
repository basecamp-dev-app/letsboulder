import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'

interface SaveFloorPlanRequest {
  name?: string
  image_url?: string
  image_width?: number
  image_height?: number
}

async function requireAdmin(request: NextRequest) {
  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }), supabase: null }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.is_admin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }), supabase: null }
  }

  return { error: null, supabase }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request)
  if (admin.error || !admin.supabase) return admin.error!
  const { supabase } = admin

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
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const admin = await requireAdmin(request)
  if (admin.error || !admin.supabase) return admin.error!
  const { supabase } = admin

  const { id: gymId } = await params

  try {
    const body = await request.json() as SaveFloorPlanRequest
    const name = body.name?.trim() || ''
    const imageUrl = body.image_url?.trim() || ''
    const imageWidth = Number(body.image_width)
    const imageHeight = Number(body.image_height)

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!imageUrl) return NextResponse.json({ error: 'image_url is required' }, { status: 400 })
    if (!Number.isFinite(imageWidth) || imageWidth <= 0) return NextResponse.json({ error: 'image_width must be a positive number' }, { status: 400 })
    if (!Number.isFinite(imageHeight) || imageHeight <= 0) return NextResponse.json({ error: 'image_height must be a positive number' }, { status: 400 })

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
