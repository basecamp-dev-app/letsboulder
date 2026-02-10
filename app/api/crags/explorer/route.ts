import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { GRADES, getGradePoints, normalizeGrade } from '@/lib/grades'
import { createRateLimitResponse, rateLimit } from '@/lib/rate-limit'

export const revalidate = 60

const DEFAULT_MIN_GRADE = '6A'
const DEFAULT_MAX_GRADE = '7A'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const QUERY_BATCH_SIZE = 1000

type SortOption = 'in_range' | 'total' | 'distance' | 'max_grade'

interface CragInfo {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  country: string | null
  region_id: string | null
  region_name: string | null
  latitude: number | null
  longitude: number | null
}

interface ClimbWithCrag {
  id: string
  grade: string | null
  consensus_grade: string | null
  route_lines: Array<{ count: number }> | null
  crags: CragInfo[] | CragInfo | null
}

interface CragAggregate {
  crag: CragInfo
  inRangeCount: number
  totalCount: number
  gradeCounts: Record<string, number>
  maxGradePoints: number
  maxGrade: string | null
  distanceKm: number | null
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

function parseSort(value: string | null): SortOption {
  if (value === 'total' || value === 'distance' || value === 'max_grade') return value
  return 'in_range'
}

function getCragFromJoin(joined: ClimbWithCrag['crags']): CragInfo | null {
  if (!joined) return null
  if (Array.isArray(joined)) return joined[0] || null
  return joined
}

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request, 'publicSearch')
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  try {
    const searchParams = request.nextUrl.searchParams
    const minGradeParam = normalizeGrade(searchParams.get('minGrade')) || DEFAULT_MIN_GRADE
    const maxGradeParam = normalizeGrade(searchParams.get('maxGrade')) || DEFAULT_MAX_GRADE
    const country = (searchParams.get('country') || '').trim().toUpperCase()
    const regionId = (searchParams.get('regionId') || '').trim()
    const sort = parseSort(searchParams.get('sort'))
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT))
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')
    const radiusParam = searchParams.get('radiusKm')

    if (!GRADES.includes(minGradeParam) || !GRADES.includes(maxGradeParam)) {
      return NextResponse.json({ error: 'Invalid grade range' }, { status: 400 })
    }

    const minIndex = GRADES.indexOf(minGradeParam)
    const maxIndex = GRADES.indexOf(maxGradeParam)
    if (minIndex > maxIndex) {
      return NextResponse.json({ error: 'minGrade must be <= maxGrade' }, { status: 400 })
    }

    let userLat: number | null = null
    let userLng: number | null = null
    let radiusKm: number | null = null

    if (latParam && lngParam) {
      const lat = Number.parseFloat(latParam)
      const lng = Number.parseFloat(lngParam)
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
      }
      userLat = lat
      userLng = lng
      if (radiusParam) {
        const parsedRadius = Number.parseFloat(radiusParam)
        if (!Number.isNaN(parsedRadius) && parsedRadius > 0) {
          radiusKm = Math.min(5000, parsedRadius)
        }
      }
    }

    let from = 0
    const climbs: ClimbWithCrag[] = []

    while (true) {
      let query = supabase
        .from('climbs')
        .select(
          `
            id,
            grade,
            consensus_grade,
            route_lines(count),
            crags!inner(id, name, slug, country_code, country, region_id, region_name, latitude, longitude)
          `
        )
        .not('crag_id', 'is', null)
        .eq('status', 'active')
        .range(from, from + QUERY_BATCH_SIZE - 1)

      if (country) {
        query = query.eq('crags.country_code', country)
      }

      if (regionId) {
        query = query.eq('crags.region_id', regionId)
      }

      const { data, error } = await query
      if (error) {
        return createErrorResponse(error, 'Error loading climbs')
      }

      const batch = (data || []) as unknown as ClimbWithCrag[]
      climbs.push(...batch)

      if (batch.length < QUERY_BATCH_SIZE) {
        break
      }

      from += QUERY_BATCH_SIZE
    }

    const aggregates = new Map<string, CragAggregate>()

    for (const climb of climbs) {
      const crag = getCragFromJoin(climb.crags)
      if (!crag) continue

      const routeCount = Array.isArray(climb.route_lines) && climb.route_lines[0] ? climb.route_lines[0].count : 0
      if (routeCount < 1) continue

      const effectiveGrade = normalizeGrade(climb.consensus_grade || climb.grade)
      if (!effectiveGrade || !GRADES.includes(effectiveGrade)) continue

      const existing = aggregates.get(crag.id) || {
        crag,
        inRangeCount: 0,
        totalCount: 0,
        gradeCounts: {},
        maxGradePoints: 0,
        maxGrade: null,
        distanceKm: null,
      }

      existing.totalCount += 1
      existing.gradeCounts[effectiveGrade] = (existing.gradeCounts[effectiveGrade] || 0) + 1

      const points = getGradePoints(effectiveGrade)
      if (points > existing.maxGradePoints) {
        existing.maxGradePoints = points
        existing.maxGrade = effectiveGrade
      }

      const gradeIndex = GRADES.indexOf(effectiveGrade)
      if (gradeIndex >= minIndex && gradeIndex <= maxIndex) {
        existing.inRangeCount += 1
      }

      aggregates.set(crag.id, existing)
    }

    let rows = Array.from(aggregates.values())

    if (userLat !== null && userLng !== null) {
      rows = rows
        .map((row) => {
          if (row.crag.latitude === null || row.crag.longitude === null) {
            return row
          }

          return {
            ...row,
            distanceKm: haversineKm(userLat, userLng, row.crag.latitude, row.crag.longitude),
          }
        })
        .filter((row) => {
          if (radiusKm === null) return true
          if (row.distanceKm === null) return false
          return row.distanceKm <= radiusKm
        })
    }

    rows.sort((a, b) => {
      if (sort === 'total') {
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
      } else if (sort === 'distance') {
        if (a.distanceKm === null && b.distanceKm !== null) return 1
        if (a.distanceKm !== null && b.distanceKm === null) return -1
        if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
      } else if (sort === 'max_grade') {
        if (b.maxGradePoints !== a.maxGradePoints) return b.maxGradePoints - a.maxGradePoints
      } else {
        if (b.inRangeCount !== a.inRangeCount) return b.inRangeCount - a.inRangeCount
      }

      if (b.inRangeCount !== a.inRangeCount) return b.inRangeCount - a.inRangeCount
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount
      return a.crag.name.localeCompare(b.crag.name)
    })

    const totalCrags = rows.length
    const totalPages = totalCrags === 0 ? 0 : Math.ceil(totalCrags / limit)
    const offset = (page - 1) * limit
    const paginated = rows.slice(offset, offset + limit)

    return NextResponse.json(
      {
        grades: GRADES,
        filters: {
          minGrade: minGradeParam,
          maxGrade: maxGradeParam,
          country: country || null,
          regionId: regionId || null,
          sort,
          radiusKm,
          hasLocation: userLat !== null && userLng !== null,
        },
        pagination: {
          page,
          limit,
          total_crags: totalCrags,
          total_pages: totalPages,
        },
        crags: paginated.map((row) => ({
          id: row.crag.id,
          name: row.crag.name,
          slug: row.crag.slug,
          country_code: row.crag.country_code,
          country: row.crag.country,
          region_id: row.crag.region_id,
          region_name: row.crag.region_name,
          latitude: row.crag.latitude,
          longitude: row.crag.longitude,
          in_range_count: row.inRangeCount,
          total_count: row.totalCount,
          max_grade: row.maxGrade,
          distance_km: row.distanceKm,
          grade_counts: row.gradeCounts,
        })),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Crag explorer error')
  }
}
