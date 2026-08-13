import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { makeUniqueSlug, fetchUsedSlugs } from '@/lib/slug'
import { createErrorResponse, reportError } from '@/lib/errors'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { getBoundingBoxesForCountry, validateCoordinatesInBoundingBox } from '@/lib/geo/bounding-boxes'
import { haversineMeters } from '@/lib/geo/haversine'
import { parseWithSchema } from '@/lib/api-validation'
import { findCragDuplicateCandidate } from '@/features/crags/lib/crag-duplicates'
import { revalidatePublicCrag, revalidatePublicCragSlug } from '@/features/crags/server/crag-cache-tags'

import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type RequestSupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>
type LocationTagRow = Pick<Database['public']['Tables']['location_tags']['Row'], 'id' | 'kind' | 'name' | 'country_code'>
type CragDuplicateRow = Pick<Database['public']['Tables']['crags']['Row'], 'id' | 'name' | 'latitude' | 'longitude'>

export const createCragSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  region_tag: z.string().nullable().optional(),
  sub_area: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  selected_country_code: z.string().nullable().optional(),
  rock_type: z.string().nullable().optional(),
  type: z.enum(['sport', 'boulder', 'bouldering', 'trad', 'mixed', 'top_rope', 'deep_water_solo', 'deep-water-solo']).optional(),
  description: z.string().optional(),
  access_notes: z.string().optional(),
}).superRefine((body, ctx) => {
  if ((body.latitude == null && body.longitude != null) || (body.latitude != null && body.longitude == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latitude'],
      message: 'Both latitude and longitude must be provided together, or neither',
    })
  }
})

const deleteCragSchema = z.object({
  reason: z.string().trim().min(1, 'Deletion reason is required').max(500),
  superseded_by: z.string().uuid().nullable().optional(),
})

export function normalizeRouteType(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'
  if (normalized === 'deep-water-solo') return 'deep_water_solo'
  if (normalized === 'top-rope') return 'top_rope'
  if (normalized === 'boulder' || normalized === 'sport' || normalized === 'trad' || normalized === 'mixed') return normalized
  return null
}

function buildRegionSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'region'
}

async function resolveRegionTagId(
  supabase: RequestSupabaseClient,
  regionTag: string,
  countryCode: string | null
): Promise<{ locationTagId: string | null; error: NextResponse | null }> {
  const { data: existingTags, error: existingTagsError } = await supabase
    .from('location_tags')
    .select('id, kind, name, country_code')
    .eq('kind', 'region')
    .ilike('name', regionTag)
    .limit(1)

  if (existingTagsError) {
    return { locationTagId: null, error: createErrorResponse(existingTagsError, 'Error resolving region tag') }
  }

  const matchedTag = ((existingTags || []) as LocationTagRow[]).find((tag) => {
    if (countryCode && tag.country_code && tag.country_code.toUpperCase() !== countryCode) return false
    return true
  }) || null

  if (matchedTag?.id) {
    return { locationTagId: matchedTag.id, error: null }
  }

  if (!countryCode) {
    return { locationTagId: null, error: null }
  }

  const { data: createdTag, error: createTagError } = await supabase
    .from('location_tags')
    .insert({
      kind: 'region',
      name: regionTag,
      slug: buildRegionSlug(regionTag),
      country_code: countryCode,
    })
    .select('id')
    .single()

  if (!createTagError && createdTag?.id) {
    return { locationTagId: createdTag.id, error: null }
  }

  const { data: fallbackTag, error: fallbackTagError } = await supabase
    .from('location_tags')
    .select('id')
    .eq('kind', 'region')
    .ilike('name', regionTag)
    .limit(1)
    .maybeSingle()

  if (fallbackTagError || !fallbackTag?.id) {
    return {
      locationTagId: null,
      error: createErrorResponse(createTagError || fallbackTagError, 'Error creating region tag'),
    }
  }

  return { locationTagId: fallbackTag.id, error: null }
}

async function validateCragDuplicates(
  supabase: RequestSupabaseClient,
  input: { latitude: number | null | undefined; longitude: number | null | undefined; name: string; countryCode: string | null }
): Promise<NextResponse | null> {
  const { latitude, longitude, name, countryCode } = input

  if (latitude != null && longitude != null) {
    const { data: existingCrags } = await supabase
      .from('crags')
      .select('id, name')
      .eq('latitude', latitude)
      .eq('longitude', longitude)
      .limit(1)

    if (existingCrags && existingCrags.length > 0) {
      return NextResponse.json({
        error: `A crag already exists at these coordinates: "${existingCrags[0].name}"`,
        existingCragId: existingCrags[0].id,
        existingCragName: existingCrags[0].name,
        code: 'DUPLICATE',
      }, { status: 409 })
    }

    const latRange = 0.02
    const lngRange = 0.03
    const { data: nearbyCrags } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude')
      .gte('latitude', latitude - latRange)
      .lte('latitude', latitude + latRange)
      .gte('longitude', longitude - lngRange)
      .lte('longitude', longitude + lngRange)
      .limit(80)

    if (nearbyCrags && nearbyCrags.length > 0) {
      const duplicateCandidate = findCragDuplicateCandidate({
        name,
        latitude,
        longitude,
        candidates: nearbyCrags as CragDuplicateRow[],
      })

      if (duplicateCandidate) {
        return NextResponse.json({
          error: `A crag with the same name already exists nearby: "${duplicateCandidate.name}"${duplicateCandidate.distance !== null ? ` (${duplicateCandidate.distance}m away)` : ''}`,
          existingCragId: duplicateCandidate.id,
          existingCragName: duplicateCandidate.name,
          code: 'DUPLICATE_NAME',
        }, { status: 409 })
      }

      for (const nearby of nearbyCrags) {
        if (nearby.latitude === null || nearby.longitude === null) continue
        const distance = haversineMeters(latitude, longitude, nearby.latitude, nearby.longitude)
        if (distance <= 200) {
          return NextResponse.json({
            error: `A crag already exists nearby: "${nearby.name}" (${Math.round(distance)}m away)`,
            existingCragId: nearby.id,
            existingCragName: nearby.name,
            code: 'DUPLICATE',
          }, { status: 409 })
        }
      }
    }
  }

  if (!countryCode) return null

  const { data: nameMatches } = await supabase
    .from('crags')
    .select('id, name, latitude, longitude')
    .eq('country_code', countryCode)
    .limit(200)

  const duplicateNameMatch = findCragDuplicateCandidate({
    name,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    candidates: (nameMatches || []) as CragDuplicateRow[],
  })

  if (duplicateNameMatch) {
    return NextResponse.json({
      error: `A crag with the same name already exists in this country: "${duplicateNameMatch.name}"`,
      existingCragId: duplicateNameMatch.id,
      existingCragName: duplicateNameMatch.name,
      code: 'DUPLICATE_NAME',
    }, { status: 409 })
  }

  return null
}

async function resolveCragCountry(
  supabase: RequestSupabaseClient,
  input: {
    latitude: number | null | undefined
    longitude: number | null | undefined
    selectedCountryCode: string | null | undefined
    trimmedRegionTag: string
  }
): Promise<{ countryCode: string | null; countryId: string | null; regionName: string | null; error: NextResponse | null }> {
  const { latitude, longitude, selectedCountryCode, trimmedRegionTag } = input

  let countryCode: string | null = null
  let countryId: string | null = null
  let regionName: string | null = null

  if (latitude != null && longitude != null) {
    if (selectedCountryCode) {
      const boundingBoxes = getBoundingBoxesForCountry(selectedCountryCode)
      if (boundingBoxes && boundingBoxes.length > 0) {
        const validation = validateCoordinatesInBoundingBox(latitude, longitude, boundingBoxes)
        if (!validation.isValid) {
          return {
            countryCode: null,
            countryId: null,
            regionName: null,
            error: NextResponse.json({ error: `Coordinates validation failed: ${validation.reason}` }, { status: 400 }),
          }
        }
        countryCode = selectedCountryCode
      } else {
        const resolved = await resolveCountryFromCoordinates(supabase, latitude, longitude)
        if (!resolved.countryCode) {
          return {
            countryCode: null,
            countryId: null,
            regionName: null,
            error: NextResponse.json({ error: 'Could not resolve country from this crag location. Please ensure your pin is on land.' }, { status: 400 }),
          }
        }
        countryCode = resolved.countryCode
        countryId = resolved.countryId
        regionName = resolved.regionName || trimmedRegionTag || null
      }
    } else {
      const resolved = await resolveCountryFromCoordinates(supabase, latitude, longitude)
      if (!resolved.countryCode) {
        return {
          countryCode: null,
          countryId: null,
          regionName: null,
          error: NextResponse.json({ error: 'Could not resolve country from this crag location. Please ensure your pin is on land.' }, { status: 400 }),
        }
      }
      countryCode = resolved.countryCode
      countryId = resolved.countryId
      regionName = resolved.regionName || trimmedRegionTag || null
    }
  }

  if (!countryCode && trimmedRegionTag) {
    const { data: existingTags } = await supabase
      .from('location_tags')
      .select('id, kind, name, country_code')
      .eq('kind', 'region')
      .ilike('name', trimmedRegionTag)
      .limit(1)

    if (existingTags && existingTags.length > 0) {
      countryCode = existingTags[0].country_code || null
    }
  }

  if (!countryCode) {
    return {
      countryCode: null,
      countryId: null,
      regionName: null,
      error: NextResponse.json({ error: 'Could not determine country. Please provide coordinates or select a valid region.' }, { status: 400 }),
    }
  }

  return { countryCode, countryId, regionName, error: null }
}

async function generateCragSlug(supabase: RequestSupabaseClient, name: string, countryCode: string | null): Promise<string> {
  const usedCragSlugs = await fetchUsedSlugs(supabase, 'crags', { country_code: countryCode || '' })

  return makeUniqueSlug(name, usedCragSlugs)
}

import { loadAdminCragsWithCounts } from './load-admin-crags'

export async function listAdminCrags(supabase: RequestSupabaseClient) {
  const { crags, error } = await loadAdminCragsWithCounts(supabase)
  if (error) {
    return createErrorResponse(new Error(error), 'Error fetching crags')
  }
  return NextResponse.json({ crags })
}

export async function createCrag(request: NextRequest, supabase: RequestSupabaseClient) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const parsedBody = parseWithSchema(createCragSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const trimmedName = body.name
    const trimmedRegionTag = body.region_tag?.trim() || ''
    const trimmedSubArea = body.sub_area?.trim() || ''
    const normalizedCragType = normalizeRouteType(body.type)

    const countryResolution = await resolveCragCountry(supabase, {
      latitude: body.latitude,
      longitude: body.longitude,
      selectedCountryCode: body.selected_country_code,
      trimmedRegionTag,
    })
    if (countryResolution.error) return countryResolution.error

    const duplicateError = await validateCragDuplicates(supabase, {
      latitude: body.latitude,
      longitude: body.longitude,
      name: trimmedName,
      countryCode: countryResolution.countryCode,
    })
    if (duplicateError) return duplicateError

    const { locationTagId, error: locationTagError } = trimmedRegionTag
      ? await resolveRegionTagId(supabase, trimmedRegionTag, countryResolution.countryCode)
      : { locationTagId: null, error: null }
    if (locationTagError) return locationTagError

    if (body.latitude != null && body.longitude != null && !countryResolution.countryCode) {
      reportError(new Error('Crag country resolution failed before insert'), {
        message: 'Create crag country resolution failed',
        extra: {
          name: trimmedName,
          latitude: body.latitude,
          longitude: body.longitude,
          selectedCountryCode: body.selected_country_code ?? null,
          regionTag: trimmedRegionTag || null,
        },
      })
      return NextResponse.json({ error: 'Could not determine country from this crag location. Please move the pin slightly or select a valid location on land.' }, { status: 400 })
    }

    const slug = await generateCragSlug(supabase, trimmedName, countryResolution.countryCode)

    const { data: insertedCrag, error: createError } = await supabase
      .from('crags')
      .insert({
        name: trimmedName,
        created_by: user.id,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        rock_type: body.rock_type || undefined,
        type: normalizedCragType,
        description: body.description || undefined,
        access_notes: body.access_notes || undefined,
        country_id: countryResolution.countryId,
        region_name: countryResolution.regionName,
        sub_area: trimmedSubArea || null,
        country_code: countryResolution.countryCode,
        slug,
      })
      .select('id, name, slug, country_code, latitude, longitude, rock_type, type, region_name, sub_area, created_at')
      .single()

    if (createError) {
      reportError(createError, { message: 'Create crag insert failed' })
      return createErrorResponse(createError, 'Error creating crag')
    }

    let createdCrag = insertedCrag
    if (countryResolution.countryCode && !createdCrag.country_code) {
      const { data: repairedCrag, error: repairCragError } = await supabase
        .from('crags')
        .update({
          country_code: countryResolution.countryCode,
          country_id: countryResolution.countryId,
          region_name: countryResolution.regionName,
        })
        .eq('id', createdCrag.id)
        .select('id, name, slug, country_code, latitude, longitude, rock_type, type, region_name, sub_area, created_at')
        .single()

      if (repairCragError || !repairedCrag?.country_code) {
        reportError(repairCragError || new Error('Crag country metadata remained empty after repair'), {
          message: 'Create crag canonical metadata repair failed',
          extra: { cragId: createdCrag.id, countryCode: countryResolution.countryCode },
        })
        return createErrorResponse(repairCragError || new Error('Crag country metadata repair failed'), 'Error creating crag')
      }

      createdCrag = repairedCrag
    }

    if (locationTagId) {
      const { error: cragTagError } = await supabase
        .from('crag_location_tags')
        .insert({
          crag_id: createdCrag.id,
          tag_id: locationTagId,
          is_primary_region: true,
        })

      if (cragTagError) {
        return createErrorResponse(cragTagError, 'Error linking crag to region tag')
      }
    }

    revalidatePath('/')
    revalidatePublicCrag(createdCrag.id)
    if (createdCrag.slug && createdCrag.country_code) {
      revalidatePublicCragSlug(createdCrag.country_code, createdCrag.slug)
      revalidatePath(`/${createdCrag.country_code.toLowerCase()}/${createdCrag.slug}`)
    }

    return NextResponse.json(createdCrag, { status: 201 })
  } catch (error) {
    reportError(error, { message: 'POST /api/crags failed' })
    return createErrorResponse(error, 'Error creating crag')
  }
}

export function getCragsInfo(rateLimitLabel: string) {
  return NextResponse.json({ message: 'Crags endpoint', method: 'POST', rate_limit: rateLimitLabel })
}

export async function deleteCrag(request: NextRequest, supabase: RequestSupabaseClient, cragId: string) {
  try {
    const parsedBody = parseWithSchema(deleteCragSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const { data: crag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code')
      .eq('id', cragId)
      .single()

    if (fetchError || !crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const { data: deletedCrag, error: deleteError } = await supabase.rpc('soft_delete_crag', {
      p_crag_id: cragId,
      p_reason: parsedBody.data.reason,
      p_superseded_by: parsedBody.data.superseded_by || undefined,
    })
    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting crag')
    }
    if (!deletedCrag) return NextResponse.json({ error: 'Crag not found' }, { status: 404 })

    revalidatePath('/')
    revalidatePublicCrag(cragId)
    if (crag.slug && crag.country_code) {
      revalidatePublicCragSlug(crag.country_code, crag.slug)
      revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
    }

    return NextResponse.json({ success: true, message: `Crag "${crag.name}" removed` })
  } catch (error) {
    return createErrorResponse(error, 'Error deleting crag')
  }
}
