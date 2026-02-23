import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, RATE_LIMITS, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { makeUniqueSlug } from '@/lib/slug'

type PlaceType = 'crag' | 'gym'

interface CreatePlaceRequest {
  name: string
  type: PlaceType
  latitude?: number | null
  longitude?: number | null
  rock_type?: string
  description?: string
  access_notes?: string
  primary_discipline?: string | null
  disciplines?: string[]
}

interface FindRegionResult {
  id: string
  name: string
  country_code: string | null
}

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
const DISALLOWED_GYM_DISCIPLINES = new Set(['trad', 'deep_water_solo'])

export async function GET() {
  return NextResponse.json({ message: 'Places endpoint', method: 'POST', rate_limit: `${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours` })
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookies.getAll() }, setAll() {} } }
  )

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const body: CreatePlaceRequest = await request.json()
    const {
      name,
      type,
      latitude,
      longitude,
      rock_type,
      description,
      access_notes,
      primary_discipline,
      disciplines,
    } = body

    const trimmedName = name?.trim() || ''

    if (!trimmedName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (type !== 'crag' && type !== 'gym') {
      return NextResponse.json({ error: 'Type must be crag or gym' }, { status: 400 })
    }

    if ((latitude == null && longitude != null) || (latitude != null && longitude == null)) {
      return NextResponse.json(
        { error: 'Both latitude and longitude must be provided together, or neither' },
        { status: 400 }
      )
    }

    if (type === 'gym' && (latitude == null || longitude == null)) {
      return NextResponse.json({ error: 'Gyms require a precise location' }, { status: 400 })
    }

    if (type === 'gym') {
      const appMetadata = (user.app_metadata || {}) as Record<string, unknown>
      const hasGymOwnerClaim = appMetadata.gym_owner === true || appMetadata.gymOwner === true
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()

      const isAdmin = profile?.is_admin === true
      if (!hasGymOwnerClaim && !isAdmin) {
        return NextResponse.json({ error: 'Only verified gym-owner accounts can create gyms' }, { status: 403 })
      }
    }

    const normalizedDisciplines = Array.from(new Set((disciplines || []).map(value => value.trim().toLowerCase()).filter(Boolean)))
    const normalizedPrimary = primary_discipline?.trim().toLowerCase() || null

    if (normalizedDisciplines.length === 0) {
      return NextResponse.json({ error: 'At least one discipline is required' }, { status: 400 })
    }

    for (const discipline of normalizedDisciplines) {
      if (!ALLOWED_DISCIPLINES.has(discipline)) {
        return NextResponse.json({ error: `Invalid discipline: ${discipline}` }, { status: 400 })
      }
      if (type === 'gym' && DISALLOWED_GYM_DISCIPLINES.has(discipline)) {
        return NextResponse.json({ error: `Gyms cannot use discipline: ${discipline}` }, { status: 400 })
      }
    }

    if (normalizedPrimary && !normalizedDisciplines.includes(normalizedPrimary)) {
      return NextResponse.json({ error: 'primary_discipline must be included in disciplines' }, { status: 400 })
    }

    if (latitude != null && longitude != null) {
      const { data: existingPlaces } = await supabase
        .from('places')
        .select('id, name')
        .eq('type', type)
        .eq('latitude', latitude)
        .eq('longitude', longitude)
        .limit(1)

      if (existingPlaces && existingPlaces.length > 0) {
        return NextResponse.json(
          {
            error: `A ${type} already exists at these coordinates: "${existingPlaces[0].name}"`,
            existingPlaceId: existingPlaces[0].id,
            existingPlaceName: existingPlaces[0].name,
            code: 'DUPLICATE'
          },
          { status: 409 }
        )
      }
    }

    if (type === 'gym') {
      const { data: existingNamedGym } = await supabase
        .from('places')
        .select('id, name')
        .eq('type', 'gym')
        .ilike('name', trimmedName)
        .limit(1)

      if (existingNamedGym && existingNamedGym.length > 0) {
        return NextResponse.json(
          {
            error: `A gym with this name already exists: "${existingNamedGym[0].name}"`,
            existingPlaceId: existingNamedGym[0].id,
            existingPlaceName: existingNamedGym[0].name,
            code: 'DUPLICATE_NAME'
          },
          { status: 409 }
        )
      }
    }

    let region: FindRegionResult | null = null
    if (latitude != null && longitude != null) {
      const { data: regionRows } = await supabase
        .rpc('find_region_by_location', { search_lat: latitude, search_lng: longitude })
      if (Array.isArray(regionRows) && regionRows.length > 0) {
        const found = regionRows[0] as unknown as FindRegionResult
        if (found?.id) region = found
      }
    }

    const countryCode = region?.country_code ? String(region.country_code).toUpperCase().slice(0, 2) : null
    const regionId = region?.id || null
    const regionName = region?.name || null

    if (type === 'gym' && !countryCode) {
      return NextResponse.json({ error: 'Could not resolve country from this gym location. Please choose a more precise pin.' }, { status: 400 })
    }

    const usedPlaceSlugs = new Set<string>()
    if (countryCode) {
      const { data: existingSlugs } = await supabase
        .from('places')
        .select('slug')
        .eq('country_code', countryCode)
        .eq('type', type)
        .not('slug', 'is', null)
        .limit(10000)
      for (const row of (existingSlugs || []) as Array<{ slug: string | null }>) {
        if (row.slug) usedPlaceSlugs.add(row.slug)
      }
    }

    const slug = countryCode ? makeUniqueSlug(trimmedName, usedPlaceSlugs) : null

    const { data: createdPlace, error: createError } = await supabase
      .from('places')
      .insert({
        name: trimmedName,
        type,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        rock_type: rock_type || undefined,
        description: description || undefined,
        access_notes: access_notes || undefined,
        region_id: regionId,
        region_name: regionName,
        country_code: countryCode,
        primary_discipline: normalizedPrimary || normalizedDisciplines[0],
        disciplines: normalizedDisciplines,
        slug,
      })
      .select('id, name, type, latitude, longitude, rock_type, primary_discipline, disciplines, slug, country_code, created_at')
      .single()

    if (createError) {
      return createErrorResponse(createError, 'Error creating place')
    }

    return NextResponse.json(createdPlace, { status: 201 })
  } catch (error) {
    return createErrorResponse(error, 'Error creating place')
  }
}
