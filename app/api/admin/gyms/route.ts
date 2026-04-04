import { NextRequest, NextResponse } from 'next/server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { requireAdmin } from '@/features/admin/server'
import { createGym } from '@/features/community/server'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!
  const { supabase } = admin.context

  try {
    const { data: gyms, error: gymsError } = await supabase
      .from('places')
      .select('id, name, slug, country_code, latitude, longitude, primary_discipline, disciplines, created_at')
      .eq('type', 'gym')
      .order('name')

    if (gymsError) return createErrorResponse(gymsError, 'Failed to load gyms')

    const gymIds = (gyms || []).map(g => g.id)

    const [plansResult, routesResult] = await Promise.all([
      gymIds.length
        ? supabase.from('gym_floor_plans').select('id, gym_place_id, name, image_url, is_active').eq('is_active', true).in('gym_place_id', gymIds)
        : Promise.resolve({ data: [], error: null }),
      gymIds.length
        ? supabase.from('gym_routes').select('id, gym_place_id').eq('status', 'active').in('gym_place_id', gymIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (plansResult.error) return createErrorResponse(plansResult.error, 'Failed to load floor plans')
    if (routesResult.error) return createErrorResponse(routesResult.error, 'Failed to load routes')

    const planByGym = new Map<string, { id: string; name: string; image_url: string }>()
    for (const plan of plansResult.data || []) {
      planByGym.set(plan.gym_place_id as string, {
        id: plan.id as string,
        name: plan.name as string,
        image_url: plan.image_url as string,
      })
    }

    const routeCountByGym = new Map<string, number>()
    for (const route of routesResult.data || []) {
      const gymPlaceId = route.gym_place_id as string
      routeCountByGym.set(gymPlaceId, (routeCountByGym.get(gymPlaceId) || 0) + 1)
    }

    const items = (gyms || []).map(gym => ({
      ...gym,
      active_floor_plan: planByGym.get(gym.id) || null,
      active_route_count: routeCountByGym.get(gym.id) || 0,
    }))

    return NextResponse.json({ gyms: items })
  } catch (error) {
    return createErrorResponse(error, 'Failed to load gyms')
  }
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'sensitive',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const admin = await requireAdmin(request)
  if (admin.error || !admin.context) return admin.error!

  return createGym(request, admin.context.supabase)
}
