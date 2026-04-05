import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { makeUniqueSlug, fetchUsedSlugs } from '@/lib/slug'
import { createErrorResponse, reportError } from '@/lib/errors'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { getBoundingBoxesForCountry, validateCoordinatesInBoundingBox } from '@/lib/geo/bounding-boxes'
import { haversineMeters } from '@/lib/geo/haversine'
import { parseWithSchema } from '@/lib/api-validation'

import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

type RequestSupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>
type LocationTagRow = Pick<Database['public']['Tables']['location_tags']['Row'], 'id' | 'kind' | 'name' | 'country_code'>

export const createCragSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  region_tag: z.string().nullable().optional(),
  sub_area: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  selected_country_code: z.string().nullable().optional(),
  rock_type: z.string().optional(),
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

    const latRange = 0.002
    const lngRange = 0.002
    const { data: nearbyCrags } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude')
      .gte('latitude', latitude - latRange)
      .lte('latitude', latitude + latRange)
      .gte('longitude', longitude - lngRange)
      .lte('longitude', longitude + lngRange)
      .limit(10)

    if (nearbyCrags && nearbyCrags.length > 0) {
      for (const nearby of nearbyCrags) {
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
    .select('id, name')
    .ilike('name', name)
    .eq('country_code', countryCode)
    .limit(1)

  if (nameMatches && nameMatches.length > 0) {
    return NextResponse.json({
      error: `A crag with the same name already exists in this country: "${nameMatches[0].name}"`,
      existingCragId: nameMatches[0].id,
      existingCragName: nameMatches[0].name,
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

  if (!countryCode && latitude != null && longitude != null) {
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

    const slug = await generateCragSlug(supabase, trimmedName, countryResolution.countryCode)

    const { data: createdCrag, error: createError } = await supabase
      .from('crags')
      .insert({
        name: trimmedName,
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
    if (createdCrag.slug && createdCrag.country_code) {
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

export const updateCragSchema = z.object({
  name: z.string().optional(),
  rock_type: z.string().nullable().optional(),
  region_tag: z.string().optional(),
  sub_area: z.string().nullable().optional(),
})

async function resolveUpdatedRegionTag(
  supabase: RequestSupabaseClient,
  regionTag: string,
  countryCode: string | null
) {
  const { data: existingTagRows, error: existingTagError } = await supabase
    .from('location_tags')
    .select('id, name, country_code')
    .eq('kind', 'region')
    .ilike('name', regionTag)
    .limit(10)

  if (existingTagError) {
    return { tagId: null, error: createErrorResponse(existingTagError, 'Error resolving region tag') }
  }

  const matchedTag = ((existingTagRows || []) as Array<{ id: string; name: string; country_code: string | null }>).find((tag) => {
    if (countryCode && tag.country_code && tag.country_code.toUpperCase() !== countryCode) return false
    return true
  })

  if (matchedTag?.id) {
    return { tagId: matchedTag.id, error: null }
  }

  const { data: createdTag, error: createdTagError } = await supabase
    .from('location_tags')
    .insert({ kind: 'region', name: regionTag, slug: buildRegionSlug(regionTag), country_code: countryCode })
    .select('id')
    .single()

  if (!createdTagError && createdTag?.id) {
    return { tagId: createdTag.id, error: null }
  }

  const { data: fallbackTag, error: fallbackTagError } = await supabase
    .from('location_tags')
    .select('id')
    .eq('kind', 'region')
    .ilike('name', regionTag)
    .limit(1)
    .maybeSingle()

  if (fallbackTagError || !fallbackTag?.id) {
    return { tagId: null, error: createErrorResponse(createdTagError || fallbackTagError, 'Error creating region tag') }
  }

  return { tagId: fallbackTag.id, error: null }
}

export async function updateCrag(request: NextRequest, supabase: RequestSupabaseClient, userId: string, cragId: string) {
  try {
    const parsedBody = parseWithSchema(updateCragSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const trimmedName = body.name?.trim()
    const trimmedRegionTag = body.region_tag?.trim()
    const normalizedSubArea = body.sub_area === undefined ? undefined : (body.sub_area?.trim() || null)

    const { data: existingCrag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code, region_name, sub_area')
      .eq('id', cragId)
      .single()

    if (fetchError || !existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) {
      if (!trimmedName) {
        return NextResponse.json({ error: 'Crag name cannot be empty' }, { status: 400 })
      }
      updateData.name = trimmedName
    }
    if (body.rock_type !== undefined) updateData.rock_type = body.rock_type
    if (normalizedSubArea !== undefined) updateData.sub_area = normalizedSubArea

    let primaryRegionTagId: string | null = null
    if (body.region_tag !== undefined) {
      if (!trimmedRegionTag) {
        return NextResponse.json({ error: 'Region tag cannot be empty' }, { status: 400 })
      }

      updateData.region_name = trimmedRegionTag
      const resolvedRegionTag = await resolveUpdatedRegionTag(
        supabase,
        trimmedRegionTag,
        existingCrag.country_code ? existingCrag.country_code.toUpperCase() : null
      )
      if (resolvedRegionTag.error) return resolvedRegionTag.error
      primaryRegionTagId = resolvedRegionTag.tagId
    }

    const { data: updatedCrag, error: updateError } = await supabase
      .from('crags')
      .update(updateData)
      .eq('id', cragId)
      .select('id, name, rock_type, type, latitude, longitude, region_name, sub_area')
      .single()

    if (updateError) {
      return createErrorResponse(updateError, 'Error updating crag')
    }

    if (body.region_tag !== undefined && primaryRegionTagId) {
      const { error: deleteTagError } = await supabase
        .from('crag_location_tags')
        .delete()
        .eq('crag_id', cragId)
        .eq('is_primary_region', true)

      if (deleteTagError) {
        return createErrorResponse(deleteTagError, 'Error clearing existing primary region tag')
      }

      const { error: insertTagError } = await supabase
        .from('crag_location_tags')
        .upsert({ crag_id: cragId, tag_id: primaryRegionTagId, is_primary_region: true }, { onConflict: 'crag_id,tag_id' })

      if (insertTagError) {
        return createErrorResponse(insertTagError, 'Error updating primary region tag')
      }
    }

    await supabase.from('admin_actions').insert({
      user_id: userId,
      action: 'rename_crag',
      target_id: cragId,
      details: {
        previous_name: existingCrag.name,
        new_name: body.name,
        rock_type: body.rock_type,
        previous_region_tag: existingCrag.region_name,
        new_region_tag: body.region_tag,
        previous_sub_area: existingCrag.sub_area,
        new_sub_area: normalizedSubArea,
      },
    })

    revalidatePath('/')
    if (existingCrag.slug && existingCrag.country_code) {
      revalidatePath(`/${existingCrag.country_code.toLowerCase()}/${existingCrag.slug}`)
    }

    return NextResponse.json({ success: true, crag: updatedCrag, message: `Crag updated: "${existingCrag.name}"` })
  } catch (error) {
    return createErrorResponse(error, 'Error updating crag')
  }
}

export async function deleteCrag(supabase: RequestSupabaseClient, userId: string, cragId: string) {
  try {
    const { data: crag, error: fetchError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code')
      .eq('id', cragId)
      .single()

    if (fetchError || !crag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const [{ data: climbData }, { data: imageData }] = await Promise.all([
      supabase.from('climbs').select('id').eq('crag_id', cragId),
      supabase.from('images').select('id').eq('crag_id', cragId),
    ])

    const climbCount = climbData?.length || 0
    const imageCount = imageData?.length || 0

    const { error: deleteError } = await supabase.from('crags').delete().eq('id', cragId)
    if (deleteError) {
      return createErrorResponse(deleteError, 'Error deleting crag')
    }

    await supabase.from('admin_actions').insert({
      user_id: userId,
      action: 'delete_crag',
      target_id: cragId,
      details: { crag_name: crag.name, climbs_deleted: climbCount, images_deleted: imageCount },
    })

    revalidatePath('/')
    if (crag.slug && crag.country_code) {
      revalidatePath(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
    }

    return NextResponse.json({ success: true, message: `Crag "${crag.name}" deleted with ${climbCount} climbs and ${imageCount} images` })
  } catch (error) {
    return createErrorResponse(error, 'Error deleting crag')
  }
}
