import { NextResponse } from 'next/server'
import { z } from 'zod'
import { makeUniqueSlug, fetchUsedSlugs } from '@/lib/slug'
import { createErrorResponse } from '@/lib/errors'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { parseWithSchema } from '@/lib/api-validation'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'

import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type RequestSupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>
type PlaceType = Database['public']['Tables']['places']['Row']['type']

const ALLOWED_DISCIPLINES = new Set(['boulder', 'sport', 'trad', 'deep_water_solo', 'mixed', 'top_rope'])
const DISALLOWED_GYM_DISCIPLINES = new Set(['trad', 'deep_water_solo'])

export const createPlaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  type: z.enum(['crag', 'gym']),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  rock_type: z.string().optional(),
  description: z.string().optional(),
  access_notes: z.string().optional(),
  primary_discipline: z.string().nullable().optional(),
  disciplines: z.array(z.string()).min(1, 'At least one discipline is required'),
}).superRefine((body, ctx) => {
  if ((body.latitude == null && body.longitude != null) || (body.latitude != null && body.longitude == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latitude'],
      message: 'Both latitude and longitude must be provided together, or neither',
    })
  }

  if (body.type === 'gym' && (body.latitude == null || body.longitude == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latitude'],
      message: 'Gyms require a precise location',
    })
  }
})

export const createGymSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  latitude: z.number(),
  longitude: z.number(),
  disciplines: z.array(z.string()).min(1, 'At least one discipline is required'),
  primary_discipline: z.string().nullable().optional(),
})

function normalizeDisciplines(type: 'crag' | 'gym', disciplines: string[], primaryDiscipline: string | null | undefined) {
  const normalizedDisciplines = Array.from(new Set(disciplines.map((value) => value.trim().toLowerCase()).filter(Boolean)))
  const normalizedPrimary = primaryDiscipline?.trim().toLowerCase() || null

  if (normalizedDisciplines.length === 0) {
    return { error: NextResponse.json({ error: 'At least one discipline is required' }, { status: 400 }), normalizedDisciplines: [], normalizedPrimary: null }
  }

  for (const discipline of normalizedDisciplines) {
    if (!ALLOWED_DISCIPLINES.has(discipline)) {
      return { error: NextResponse.json({ error: `Invalid discipline: ${discipline}` }, { status: 400 }), normalizedDisciplines: [], normalizedPrimary: null }
    }
    if (type === 'gym' && DISALLOWED_GYM_DISCIPLINES.has(discipline)) {
      return { error: NextResponse.json({ error: `Gyms cannot use discipline: ${discipline}` }, { status: 400 }), normalizedDisciplines: [], normalizedPrimary: null }
    }
  }

  if (normalizedPrimary && !normalizedDisciplines.includes(normalizedPrimary)) {
    return { error: NextResponse.json({ error: 'primary_discipline must be included in disciplines' }, { status: 400 }), normalizedDisciplines: [], normalizedPrimary: null }
  }

  return { error: null, normalizedDisciplines, normalizedPrimary }
}

async function generatePlaceSlug(supabase: RequestSupabaseClient, name: string, countryCode: string | null, type: string) {
  if (!countryCode) return null

  const usedPlaceSlugs = await fetchUsedSlugs(supabase, 'places', { country_code: countryCode, type })

  return makeUniqueSlug(name, usedPlaceSlugs)
}

async function assertGymCreationAllowed(supabase: RequestSupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const appMetadata = (user.app_metadata || {}) as Record<string, unknown>
  const hasGymOwnerClaim = appMetadata.gym_owner === true || appMetadata.gymOwner === true

  const { data: isAdmin } = await isCurrentUserAdmin(supabase)

  if (!hasGymOwnerClaim && isAdmin !== true) {
    return NextResponse.json({ error: 'Only verified gym-owner accounts can create gyms' }, { status: 403 })
  }

  return null
}

async function validatePlaceDuplicates(
  supabase: RequestSupabaseClient,
  input: { type: PlaceType; latitude: number | null | undefined; longitude: number | null | undefined; name: string }
) {
  const { type, latitude, longitude, name } = input

  if (latitude != null && longitude != null) {
    const { data: existingPlaces } = await supabase
      .from('places')
      .select('id, name')
      .eq('type', type)
      .eq('latitude', latitude)
      .eq('longitude', longitude)
      .limit(1)

    if (existingPlaces && existingPlaces.length > 0) {
      return NextResponse.json({
        error: `A ${type} already exists at these coordinates: "${existingPlaces[0].name}"`,
        existingPlaceId: existingPlaces[0].id,
        existingPlaceName: existingPlaces[0].name,
        code: 'DUPLICATE',
      }, { status: 409 })
    }
  }

  if (type === 'gym') {
    const { data: existingNamedGym } = await supabase
      .from('places')
      .select('id, name')
      .eq('type', 'gym')
      .ilike('name', name)
      .limit(1)

    if (existingNamedGym && existingNamedGym.length > 0) {
      return NextResponse.json({
        error: `A gym with this name already exists: "${existingNamedGym[0].name}"`,
        existingPlaceId: existingNamedGym[0].id,
        existingPlaceName: existingNamedGym[0].name,
        code: 'DUPLICATE_NAME',
      }, { status: 409 })
    }
  }

  return null
}

async function insertPlace(
  supabase: RequestSupabaseClient,
  input: {
    name: string
    type: 'crag' | 'gym'
    latitude: number | null | undefined
    longitude: number | null | undefined
    rockType: string | undefined
    description: string | undefined
    accessNotes: string | undefined
    primaryDiscipline: string | null
    disciplines: string[]
  }
) {
  const result = await resolveCountryFromCoordinates(supabase, input.latitude, input.longitude)

  if (input.type === 'gym' && !result.countryCode) {
    return NextResponse.json({ error: 'Could not resolve country from this gym location. Please ensure your pin is on land.' }, { status: 400 })
  }

  const slug = await generatePlaceSlug(supabase, input.name, result.countryCode, input.type)

  const { data: createdPlace, error: createError } = await supabase
    .from('places')
    .insert({
      name: input.name,
      type: input.type,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      rock_type: input.rockType || undefined,
      description: input.description || undefined,
      access_notes: input.accessNotes || undefined,
      country_id: result.countryId,
      region_name: result.regionName,
      country_code: result.countryCode,
      primary_discipline: input.primaryDiscipline || input.disciplines[0],
      disciplines: input.disciplines,
      slug,
    })
    .select('id, name, type, latitude, longitude, rock_type, primary_discipline, disciplines, slug, country_code, created_at')
    .single()

  if (createError) {
    return createErrorResponse(createError, `Error creating ${input.type}`)
  }

  return NextResponse.json(createdPlace, { status: 201 })
}

export async function createPlace(request: NextRequest, supabase: RequestSupabaseClient) {
  try {
    const parsedBody = parseWithSchema(createPlaceSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const trimmedName = body.name.trim()

    if (body.type === 'gym') {
      const authError = await assertGymCreationAllowed(supabase)
      if (authError) return authError
    }

    const disciplineResult = normalizeDisciplines(body.type, body.disciplines, body.primary_discipline)
    if (disciplineResult.error) return disciplineResult.error

    const duplicateError = await validatePlaceDuplicates(supabase, {
      type: body.type,
      latitude: body.latitude,
      longitude: body.longitude,
      name: trimmedName,
    })
    if (duplicateError) return duplicateError

    return insertPlace(supabase, {
      name: trimmedName,
      type: body.type,
      latitude: body.latitude,
      longitude: body.longitude,
      rockType: body.rock_type,
      description: body.description,
      accessNotes: body.access_notes,
      primaryDiscipline: disciplineResult.normalizedPrimary,
      disciplines: disciplineResult.normalizedDisciplines,
    })
  } catch (error) {
    return createErrorResponse(error, 'Error creating place')
  }
}

export async function createGym(request: NextRequest, supabase: RequestSupabaseClient) {
  try {
    const parsedBody = parseWithSchema(createGymSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const trimmedName = body.name
    const disciplineResult = normalizeDisciplines('gym', body.disciplines, body.primary_discipline)
    if (disciplineResult.error) return disciplineResult.error

    const duplicateError = await validatePlaceDuplicates(supabase, {
      type: 'gym',
      latitude: body.latitude,
      longitude: body.longitude,
      name: trimmedName,
    })
    if (duplicateError) return duplicateError

    return insertPlace(supabase, {
      name: trimmedName,
      type: 'gym',
      latitude: body.latitude,
      longitude: body.longitude,
      rockType: undefined,
      description: undefined,
      accessNotes: undefined,
      primaryDiscipline: disciplineResult.normalizedPrimary,
      disciplines: disciplineResult.normalizedDisciplines,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to create gym')
  }
}
