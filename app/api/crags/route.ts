import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { createErrorResponse, reportError } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { makeUniqueSlug } from '@/lib/slug'
import { revalidatePath } from 'next/cache'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { getBoundingBoxesForCountry, validateCoordinatesInBoundingBox } from '@/lib/geo/bounding-boxes'
import { haversineMeters } from '@/lib/geo/haversine'
import { parseWithSchema } from '@/lib/api-validation'

const createCragSchema = z.object({
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

interface LocationTagRow {
  id: string
  kind: 'region' | 'sub_area'
  name: string
  country_code: string | null
}

interface CragWithCounts {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  rock_type: string | null
  type: string | null
  region_tag: string | null
  sub_area: string | null
  has_primary_region_tag: boolean
  climb_count: number
  image_count: number
  route_type_counts: Array<{ type: string; count: number }>
  created_at: string
}

interface CragPrimaryTagRow {
  crag_id: string
  location_tags: {
    id: string
    name: string
  } | Array<{
    id: string
    name: string
  }> | null
}

function normalizeRouteType(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'
  if (normalized === 'deep-water-solo') return 'deep_water_solo'
  if (normalized === 'top-rope') return 'top_rope'
  if (normalized === 'boulder' || normalized === 'sport' || normalized === 'trad' || normalized === 'mixed') return normalized
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const adminMode = searchParams.get('admin') === 'true'

  if (!adminMode) {
    return NextResponse.json({ message: 'Crags endpoint', method: 'POST', rate_limit: `${RATE_LIMITS.authenticatedWrite.maxRequests} per ${RATE_LIMITS.authenticatedWrite.windowMs / 60000} hours` })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: crags, error: cragsError } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude, rock_type, type, region_name, sub_area, created_at')

    if (cragsError) {
      return createErrorResponse(cragsError, 'Error fetching crags')
    }

    const cragIds = crags?.map(c => c.id) || []

    let primaryTags: CragPrimaryTagRow[] = []
    if (cragIds.length > 0) {
      const { data: primaryTagRows, error: primaryTagError } = await supabase
        .from('crag_location_tags')
        .select('crag_id, location_tags!inner(id,name)')
        .eq('is_primary_region', true)
        .in('crag_id', cragIds)

      if (primaryTagError) {
        return createErrorResponse(primaryTagError, 'Error fetching crag tags')
      }

      primaryTags = (primaryTagRows || []) as CragPrimaryTagRow[]
    }

    const primaryTagMap = new Map<string, string>()
    const cragIdsWithPrimaryTag = new Set<string>()
    for (const row of primaryTags) {
      const locationTag = Array.isArray(row.location_tags) ? row.location_tags[0] : row.location_tags
      if (!locationTag?.name) continue
      primaryTagMap.set(row.crag_id, locationTag.name)
      cragIdsWithPrimaryTag.add(row.crag_id)
    }

    let climbCounts: Array<{ crag_id: string | null; route_type: string | null; status: string | null; deleted_at: string | null }> = []
    if (cragIds.length > 0) {
      const { data, error: climbError } = await supabase
        .from('climbs')
        .select('crag_id, id, route_type, status, deleted_at')
        .in('crag_id', cragIds)

      if (climbError) {
        return createErrorResponse(climbError, 'Error fetching climb counts')
      }

      climbCounts = data || []
    }

    let imageCounts: Array<{ crag_id: string | null }> = []
    if (cragIds.length > 0) {
      const { data, error: imageError } = await supabase
        .from('images')
        .select('crag_id, id')
        .in('crag_id', cragIds)

      if (imageError) {
        return createErrorResponse(imageError, 'Error fetching image counts')
      }

      imageCounts = data || []
    }

    const climbCountMap = new Map<string, number>()
    const routeTypeCountMap = new Map<string, Map<string, number>>()
    for (const c of climbCounts || []) {
      if (!c.crag_id) continue
      if (c.deleted_at) continue
      if (c.status && c.status !== 'approved') continue

      climbCountMap.set(c.crag_id, (climbCountMap.get(c.crag_id) || 0) + 1)

      const normalizedType = normalizeRouteType(c.route_type)
      if (!normalizedType) continue

      let perCrag = routeTypeCountMap.get(c.crag_id)
      if (!perCrag) {
        perCrag = new Map<string, number>()
        routeTypeCountMap.set(c.crag_id, perCrag)
      }

      perCrag.set(normalizedType, (perCrag.get(normalizedType) || 0) + 1)
    }

    const imageCountMap = new Map<string, number>()
    for (const i of imageCounts || []) {
      if (i.crag_id) {
        imageCountMap.set(i.crag_id, (imageCountMap.get(i.crag_id) || 0) + 1)
      }
    }

    const cragsWithCounts: CragWithCounts[] = (crags || []).map(crag => ({
      id: crag.id,
      name: crag.name,
      latitude: crag.latitude,
      longitude: crag.longitude,
      rock_type: crag.rock_type,
      type: crag.type,
      region_tag: primaryTagMap.get(crag.id) || crag.region_name || null,
      sub_area: crag.sub_area || null,
      has_primary_region_tag: cragIdsWithPrimaryTag.has(crag.id),
      climb_count: climbCountMap.get(crag.id) || 0,
      image_count: imageCountMap.get(crag.id) || 0,
      route_type_counts: Array.from(routeTypeCountMap.get(crag.id)?.entries() || [])
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return a.type.localeCompare(b.type)
        }),
      created_at: crag.created_at
    }))

    return NextResponse.json({ crags: cragsWithCounts })
  } catch (error) {
    return createErrorResponse(error, 'Error fetching crags')
  }
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const parsedBody = parseWithSchema(createCragSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const { name, region_tag, sub_area, latitude, longitude, selected_country_code, rock_type, type, description, access_notes } = body
    const normalizedCragType = normalizeRouteType(type)
    const trimmedName = name
    const trimmedRegionTag = region_tag?.trim() || ''
    const trimmedSubArea = sub_area?.trim() || ''

    if (latitude != null && longitude != null) {
      const { data: existingCrags } = await supabase
        .from('crags')
        .select('id, name')
        .eq('latitude', latitude)
        .eq('longitude', longitude)
        .limit(1)

      if (existingCrags && existingCrags.length > 0) {
        return NextResponse.json(
          {
            error: `A crag already exists at these coordinates: "${existingCrags[0].name}"`,
            existingCragId: existingCrags[0].id,
            existingCragName: existingCrags[0].name,
            code: 'DUPLICATE'
          },
          { status: 409 }
        )
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
            return NextResponse.json(
              {
                error: `A crag already exists nearby: "${nearby.name}" (${Math.round(distance)}m away)`,
                existingCragId: nearby.id,
                existingCragName: nearby.name,
                code: 'DUPLICATE'
              },
              { status: 409 }
            )
          }
        }
      }
    }

    // Validate coordinates against selected country's bounding box if provided
    let countryCode: string | null = null
    let countryId: string | null = null
    let regionName: string | null = null

    if (latitude != null && longitude != null) {
      // Use selected country code if provided, otherwise resolve from coordinates
      if (selected_country_code) {
        const boundingBoxes = getBoundingBoxesForCountry(selected_country_code)
        
        if (boundingBoxes && boundingBoxes.length > 0) {
          const validation = validateCoordinatesInBoundingBox(latitude, longitude, boundingBoxes)

          if (!validation.isValid) {
            return NextResponse.json(
              { error: `Coordinates validation failed: ${validation.reason}` },
              { status: 400 }
            )
          }

          countryCode = selected_country_code
        } else {
          const resolved = await resolveCountryFromCoordinates(supabase, latitude, longitude)
          if (!resolved.countryCode) {
            return NextResponse.json(
              { error: 'Could not resolve country from this crag location. Please ensure your pin is on land.' },
              { status: 400 }
            )
          }
          countryCode = resolved.countryCode
          countryId = resolved.countryId
          regionName = resolved.regionName || trimmedRegionTag || null
        }
      } else {
        const result = await resolveCountryFromCoordinates(supabase, latitude, longitude)

        if (!result.countryCode) {
          return NextResponse.json(
            { error: 'Could not resolve country from this crag location. Please ensure your pin is on land.' },
            { status: 400 }
          )
        }

        countryCode = result.countryCode
        countryId = result.countryId
        regionName = result.regionName || trimmedRegionTag || null
      }
    }

    // If coordinates not provided, region can be used to determine country
    if (!countryCode && trimmedRegionTag) {
      // Try to find the country from the region tag
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
      return NextResponse.json(
        { error: 'Could not determine country. Please provide coordinates or select a valid region.' },
        { status: 400 }
      )
    }

    if (countryCode) {
      const { data: nameMatches } = await supabase
        .from('crags')
        .select('id, name')
        .ilike('name', trimmedName)
        .eq('country_code', countryCode)
        .limit(1)

      if (nameMatches && nameMatches.length > 0) {
        return NextResponse.json(
          {
            error: `A crag with the same name already exists in this country: "${nameMatches[0].name}"`,
            existingCragId: nameMatches[0].id,
            existingCragName: nameMatches[0].name,
            code: 'DUPLICATE_NAME'
          },
          { status: 409 }
        )
      }
    }

    let locationTagId: string | null = null
    if (trimmedRegionTag) {
      const { data: existingTags, error: existingTagsError } = await supabase
        .from('location_tags')
        .select('id, kind, name, country_code')
        .eq('kind', 'region')
        .ilike('name', trimmedRegionTag)
        .limit(1)

      if (existingTagsError) {
        return createErrorResponse(existingTagsError, 'Error resolving region tag')
      }

      const matchedTag = ((existingTags || []) as LocationTagRow[]).find((tag) => {
        if (countryCode && tag.country_code && tag.country_code.toUpperCase() !== countryCode) return false
        return true
      }) || null

      if (matchedTag?.id) {
        locationTagId = matchedTag.id
      } else if (countryCode) {
        const regionSlug = trimmedRegionTag
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'region'

        const { data: createdTag, error: createTagError } = await supabase
          .from('location_tags')
          .insert({
            kind: 'region',
            name: trimmedRegionTag,
            slug: regionSlug,
            country_code: countryCode,
          })
          .select('id')
          .single()

        if (createTagError || !createdTag?.id) {
          const { data: fallbackTag, error: fallbackTagError } = await supabase
            .from('location_tags')
            .select('id')
            .eq('kind', 'region')
            .ilike('name', trimmedRegionTag)
            .limit(1)
            .maybeSingle()

          if (fallbackTagError || !fallbackTag?.id) {
            return createErrorResponse(createTagError || fallbackTagError, 'Error creating region tag')
          }

          locationTagId = fallbackTag.id
        } else {
          locationTagId = createdTag.id
        }
      }
    }

    const usedCragSlugs = new Set<string>()
    const { data: existingSlugs } = await supabase
      .from('crags')
      .select('slug')
      .eq('country_code', countryCode || '')
      .not('slug', 'is', null)
      .limit(10000)
    for (const row of (existingSlugs || []) as Array<{ slug: string | null }>) {
      if (row.slug) usedCragSlugs.add(row.slug)
    }
    const slug = makeUniqueSlug(trimmedName, usedCragSlugs)

    const { data: createdCrag, error: createError } = await supabase
      .from('crags')
      .insert({
        name: trimmedName,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        rock_type: rock_type || undefined,
        type: normalizedCragType,
        description: description || undefined,
        access_notes: access_notes || undefined,
        country_id: countryId,
        region_name: regionName,
        sub_area: trimmedSubArea || null,
        country_code: countryCode,
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
    if (createdCrag?.slug && createdCrag?.country_code) {
      revalidatePath(`/${createdCrag.country_code.toLowerCase()}/${createdCrag.slug}`)
    }

    return NextResponse.json(createdCrag, { status: 201 })
  } catch (error) {
    reportError(error, { message: 'POST /api/crags failed' })
    return createErrorResponse(error, 'Error creating crag')
  }
}
