import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const { data: memberships, error: membershipsError } = await supabase
      .from('gym_memberships')
      .select('gym_place_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (membershipsError) return createErrorResponse(membershipsError, 'Failed to load gym memberships')

    const gymIds = (memberships || []).map(item => item.gym_place_id as string)
    if (gymIds.length === 0) {
      return NextResponse.json({ gyms: [] })
    }

    const { data: gyms, error: gymsError } = await supabase
      .from('places')
      .select('id, name, slug, country_code, latitude, longitude, primary_discipline, disciplines')
      .eq('type', 'gym')
      .in('id', gymIds)
      .order('name')

    if (gymsError) return createErrorResponse(gymsError, 'Failed to load gyms')

    const [plansResult, routesResult] = await Promise.all([
      supabase
        .from('gym_floor_plans')
        .select('id, gym_place_id, name, image_url')
        .eq('is_active', true)
        .in('gym_place_id', gymIds),
      supabase
        .from('gym_routes')
        .select('id, gym_place_id')
        .eq('status', 'active')
        .in('gym_place_id', gymIds),
    ])

    if (plansResult.error) return createErrorResponse(plansResult.error, 'Failed to load floor plans')
    if (routesResult.error) return createErrorResponse(routesResult.error, 'Failed to load routes')

    const roleByGymId = new Map<string, string>()
    for (const membership of memberships || []) {
      roleByGymId.set(membership.gym_place_id as string, membership.role as string)
    }

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
      const gymId = route.gym_place_id as string
      routeCountByGym.set(gymId, (routeCountByGym.get(gymId) || 0) + 1)
    }

    const items = (gyms || []).map(gym => ({
      ...gym,
      membership_role: roleByGymId.get(gym.id) || null,
      active_floor_plan: planByGym.get(gym.id) || null,
      active_route_count: routeCountByGym.get(gym.id) || 0,
    }))

    return NextResponse.json({ gyms: items })
  } catch (error) {
    return createErrorResponse(error, 'Failed to load gyms')
  }
}
