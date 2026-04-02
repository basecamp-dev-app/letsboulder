import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { makeUniqueSlug } from '@/lib/slug'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { parseWithSchema } from '@/lib/api-validation'

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'mixed', 'top_rope'])

const createGymSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  latitude: z.number(),
  longitude: z.number(),
  disciplines: z.array(z.string()).min(1, 'At least one discipline is required'),
  primary_discipline: z.string().nullable().optional(),
})

async function requireAdmin(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

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

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin.error || !admin.supabase) return admin.error!
  const { supabase } = admin

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
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const admin = await requireAdmin(request)
  if (admin.error || !admin.supabase) return admin.error!
  const { supabase } = admin

  try {
    const parsedBody = parseWithSchema(createGymSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const trimmedName = body.name
    const latitude = body.latitude
    const longitude = body.longitude
    const normalizedDisciplines = Array.from(new Set((body.disciplines || []).map(value => value.trim().toLowerCase()).filter(Boolean)))
    const normalizedPrimary = body.primary_discipline?.trim().toLowerCase() || null

    for (const discipline of normalizedDisciplines) {
      if (!ALLOWED_DISCIPLINES.has(discipline)) {
        return NextResponse.json({ error: `Invalid discipline: ${discipline}` }, { status: 400 })
      }
    }

    if (normalizedPrimary && !normalizedDisciplines.includes(normalizedPrimary)) {
      return NextResponse.json({ error: 'primary_discipline must be included in disciplines' }, { status: 400 })
    }

    const { data: existingNamedGym } = await supabase
      .from('places')
      .select('id, name')
      .eq('type', 'gym')
      .ilike('name', trimmedName)
      .limit(1)

    if (existingNamedGym && existingNamedGym.length > 0) {
      return NextResponse.json({ error: `A gym with this name already exists: "${existingNamedGym[0].name}"` }, { status: 409 })
    }

    const result = await resolveCountryFromCoordinates(supabase, latitude, longitude)

    if (!result.countryCode) {
      return NextResponse.json(
        { error: 'Could not resolve country from this gym location. Please ensure your pin is on land.' },
        { status: 400 }
      )
    }

    const countryCode = result.countryCode
    const countryId = result.countryId
    const regionName = result.regionName

    const usedSlugs = new Set<string>()
    const { data: existingSlugs } = await supabase
      .from('places')
      .select('slug')
      .eq('country_code', countryCode)
      .eq('type', 'gym')
      .not('slug', 'is', null)
      .limit(10000)

    for (const row of (existingSlugs || []) as Array<{ slug: string | null }>) {
      if (row.slug) usedSlugs.add(row.slug)
    }

    const slug = makeUniqueSlug(trimmedName, usedSlugs)

    const { data: createdGym, error: createError } = await supabase
      .from('places')
      .insert({
        name: trimmedName,
        type: 'gym',
        latitude,
        longitude,
        country_id: countryId,
        region_name: regionName,
        country_code: countryCode,
        primary_discipline: normalizedPrimary || normalizedDisciplines[0],
        disciplines: normalizedDisciplines,
        slug,
      })
      .select('id, name, slug, country_code, latitude, longitude, primary_discipline, disciplines, created_at')
      .single()

    if (createError) return createErrorResponse(createError, 'Failed to create gym')

    return NextResponse.json(createdGym, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Failed to create gym')
  }
}
