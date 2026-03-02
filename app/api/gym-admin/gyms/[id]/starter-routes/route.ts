import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

interface StarterRouteInput {
  id?: string
  floor_plan_id: string
  name?: string | null
  grade: string
  discipline: 'boulder' | 'sport' | 'top_rope' | 'mixed'
  color?: string | null
  setter_name?: string | null
  status?: 'active' | 'retired'
  marker: {
    x_norm: number
    y_norm: number
  }
}

interface SaveStarterRoutesRequest {
  routes?: StarterRouteInput[]
}

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'top_rope', 'mixed'])
const ALLOWED_STATUS = new Set(['active', 'retired'])
const ROUTE_EDITOR_ROLES = new Set(['owner', 'manager', 'head_setter', 'setter'])

async function requireGymRouteAccess(request: NextRequest, gymId: string) {
  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  const { userId } = await resolveUserIdWithFallback(request, supabase)
  if (!userId) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }), supabase: null, role: null as string | null }

  const { data: membership, error: membershipError } = await supabase
    .from('gym_memberships')
    .select('role, status')
    .eq('user_id', userId)
    .eq('gym_place_id', gymId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError || !membership || !ROUTE_EDITOR_ROLES.has(membership.role)) {
    return { error: NextResponse.json({ error: 'Gym access required' }, { status: 403 }), supabase: null, role: null as string | null }
  }

  return { error: null, supabase, role: membership.role as string }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: gymId } = await params
  const access = await requireGymRouteAccess(request, gymId)
  if (access.error || !access.supabase) return access.error!
  const { supabase } = access

  try {
    const { data: floorPlan } = await supabase
      .from('gym_floor_plans')
      .select('id, gym_place_id, name, image_url, image_width, image_height, is_active')
      .eq('gym_place_id', gymId)
      .eq('is_active', true)
      .maybeSingle()

    if (!floorPlan) {
      return NextResponse.json({ floor_plan: null, routes: [], membership_role: access.role })
    }

    const { data: routes, error: routesError } = await supabase
      .from('gym_routes')
      .select('id, gym_place_id, floor_plan_id, name, grade, discipline, color, setter_name, status, created_at')
      .eq('gym_place_id', gymId)
      .eq('floor_plan_id', floorPlan.id)
      .order('created_at', { ascending: true })

    if (routesError) return createErrorResponse(routesError, 'Failed to load routes')

    const routeIds = (routes || []).map(route => route.id)
    const { data: markers, error: markersError } = routeIds.length
      ? await supabase
        .from('gym_route_markers')
        .select('route_id, x_norm, y_norm')
        .in('route_id', routeIds)
      : { data: [], error: null }

    if (markersError) return createErrorResponse(markersError, 'Failed to load route markers')

    const markerByRouteId = new Map<string, { x_norm: number; y_norm: number }>()
    for (const marker of markers || []) {
      markerByRouteId.set(marker.route_id as string, {
        x_norm: Number(marker.x_norm),
        y_norm: Number(marker.y_norm),
      })
    }

    const items = (routes || []).map(route => ({
      ...route,
      marker: markerByRouteId.get(route.id) || null,
    }))

    return NextResponse.json({ floor_plan: floorPlan, routes: items, membership_role: access.role })
  } catch (error) {
    return createErrorResponse(error, 'Failed to load starter routes')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id: gymId } = await params
  const access = await requireGymRouteAccess(request, gymId)
  if (access.error || !access.supabase) return access.error!
  const { supabase } = access

  try {
    const body = await request.json() as SaveStarterRoutesRequest
    const routes = body.routes || []

    const { data: floorPlan } = await supabase
      .from('gym_floor_plans')
      .select('id, gym_place_id, is_active')
      .eq('gym_place_id', gymId)
      .eq('is_active', true)
      .maybeSingle()

    if (!floorPlan) return NextResponse.json({ error: 'Active floor plan not found for this gym' }, { status: 400 })

    const floorPlanId = floorPlan.id as string

    for (const route of routes) {
      if (route.floor_plan_id !== floorPlanId) {
        return NextResponse.json({ error: 'All routes must belong to the active floor plan' }, { status: 400 })
      }

      const grade = route.grade?.trim() || ''
      if (!grade) return NextResponse.json({ error: 'Each route must have a grade' }, { status: 400 })

      if (!ALLOWED_DISCIPLINES.has(route.discipline)) {
        return NextResponse.json({ error: `Invalid discipline: ${route.discipline}` }, { status: 400 })
      }

      const status = route.status || 'active'
      if (!ALLOWED_STATUS.has(status)) {
        return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
      }

      if (!Number.isFinite(route.marker?.x_norm) || !Number.isFinite(route.marker?.y_norm)) {
        return NextResponse.json({ error: 'Each route must include marker coordinates' }, { status: 400 })
      }

      if (route.marker.x_norm < 0 || route.marker.x_norm > 1 || route.marker.y_norm < 0 || route.marker.y_norm > 1) {
        return NextResponse.json({ error: 'Marker coordinates must be between 0 and 1' }, { status: 400 })
      }
    }

    const { data: existingRoutes, error: existingRoutesError } = await supabase
      .from('gym_routes')
      .select('id')
      .eq('gym_place_id', gymId)
      .eq('floor_plan_id', floorPlanId)

    if (existingRoutesError) return createErrorResponse(existingRoutesError, 'Failed to load existing starter routes')

    const existingRouteIds = new Set((existingRoutes || []).map(item => item.id as string))
    const keptRouteIds = new Set<string>()

    for (const route of routes) {
      const name = route.name?.trim() || null
      const grade = route.grade.trim()
      const discipline = route.discipline
      const color = route.color?.trim() || null
      const setterName = route.setter_name?.trim() || null
      const status = route.status || 'active'

      let routeId = route.id && existingRouteIds.has(route.id) ? route.id : null

      if (routeId) {
        const { error: updateError } = await supabase
          .from('gym_routes')
          .update({
            name,
            grade,
            discipline,
            color,
            setter_name: setterName,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', routeId)
          .eq('gym_place_id', gymId)
          .eq('floor_plan_id', floorPlanId)

        if (updateError) return createErrorResponse(updateError, 'Failed to update starter route')
      } else {
        const { data: insertedRoute, error: insertError } = await supabase
          .from('gym_routes')
          .insert({
            gym_place_id: gymId,
            floor_plan_id: floorPlanId,
            name,
            grade,
            discipline,
            color,
            setter_name: setterName,
            status,
          })
          .select('id')
          .single()

        if (insertError) return createErrorResponse(insertError, 'Failed to create starter route')
        routeId = insertedRoute.id as string
      }

      keptRouteIds.add(routeId)

      const { error: markerError } = await supabase
        .from('gym_route_markers')
        .upsert({
          route_id: routeId,
          x_norm: route.marker.x_norm,
          y_norm: route.marker.y_norm,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'route_id' })

      if (markerError) return createErrorResponse(markerError, 'Failed to save route marker')
    }

    const routeIdsToDelete = Array.from(existingRouteIds).filter(id => !keptRouteIds.has(id))
    if (routeIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('gym_routes')
        .delete()
        .in('id', routeIdsToDelete)
        .eq('gym_place_id', gymId)
        .eq('floor_plan_id', floorPlanId)

      if (deleteError) return createErrorResponse(deleteError, 'Failed to delete removed starter routes')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to save starter routes')
  }
}
