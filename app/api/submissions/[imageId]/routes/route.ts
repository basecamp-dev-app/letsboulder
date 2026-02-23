import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { makeUniqueSlug } from '@/lib/slug'
import { revalidatePath } from 'next/cache'

interface RoutePoint {
  x: number
  y: number
}

interface EditableRoutePayload {
  id: string
  name: string
  description?: string
  points: RoutePoint[]
}

interface NewRoutePayload {
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

const VALID_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const
const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const

const MAX_ROUTES_PER_REQUEST = 40

function normalizeRouteType(value: string | null | undefined): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'

  if (!VALID_ROUTE_TYPES.includes(normalized as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }

  return normalized as (typeof VALID_ROUTE_TYPES)[number]
}

function isValidPoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoutePoint>
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y)
  )
}

function normalizeRoutes(value: unknown): EditableRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: EditableRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const route = item as Partial<EditableRoutePayload>
    if (typeof route.id !== 'string' || !route.id) return null
    if (typeof route.name !== 'string') return null
    if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') return null
    if (!Array.isArray(route.points) || route.points.length < 2 || !route.points.every(isValidPoint)) return null

    routes.push({
      id: route.id,
      name: route.name,
      description: route.description,
      points: route.points,
    })
  }

  return routes
}

function normalizeNewRoutes(value: unknown): NewRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: NewRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const route = item as Partial<NewRoutePayload>
    if (typeof route.name !== 'string') return null
    if (typeof route.grade !== 'string') return null
    if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') return null
    if (!Array.isArray(route.points) || route.points.length < 2 || !route.points.every(isValidPoint)) return null
    if (typeof route.sequenceOrder !== 'number' || !Number.isFinite(route.sequenceOrder)) return null
    if (typeof route.imageWidth !== 'number' || !Number.isFinite(route.imageWidth) || route.imageWidth <= 0) return null
    if (typeof route.imageHeight !== 'number' || !Number.isFinite(route.imageHeight) || route.imageHeight <= 0) return null

    routes.push({
      name: route.name,
      grade: route.grade,
      description: route.description,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
      imageWidth: route.imageWidth,
      imageHeight: route.imageHeight,
    })
  }

  return routes
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
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

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const routes = normalizeNewRoutes(body?.routes)
    const submittedRouteType = typeof body?.routeType === 'string'
      ? normalizeRouteType(body.routeType)
      : null

    if (typeof body?.routeType === 'string' && !submittedRouteType) {
      return NextResponse.json({ error: 'Invalid route type' }, { status: 400 })
    }

    if (!routes || routes.length === 0) {
      return NextResponse.json({ error: 'A valid routes array is required' }, { status: 400 })
    }

    if (routes.length > MAX_ROUTES_PER_REQUEST) {
      return NextResponse.json({ error: `You can add up to ${MAX_ROUTES_PER_REQUEST} routes at once` }, { status: 400 })
    }

    for (const route of routes) {
      if (!route.name.trim()) {
        return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
      }
      if (!VALID_GRADES.includes(route.grade as (typeof VALID_GRADES)[number])) {
        return NextResponse.json({ error: 'Invalid route grade' }, { status: 400 })
      }
      if (route.name.trim().length > 200) {
        return NextResponse.json({ error: 'Route name must be 200 characters or less' }, { status: 400 })
      }
      if (route.description && route.description.trim().length > 500) {
        return NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 })
      }
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, created_by, crag_id')
      .eq('id', imageId)
      .single()

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (image.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the original submitter can add routes to this image' }, { status: 403 })
    }

    const { data: existingRouteLines, error: existingRouteLinesError } = await supabase
      .from('route_lines')
      .select('sequence_order')
      .eq('image_id', imageId)

    if (existingRouteLinesError) {
      return createErrorResponse(existingRouteLinesError, 'Create routes error')
    }

    const startingSequenceOrder = (existingRouteLines || []).reduce((maxOrder, line) => {
      return Math.max(maxOrder, typeof line.sequence_order === 'number' ? line.sequence_order : 0)
    }, -1) + 1

    let resolvedRouteType: (typeof VALID_ROUTE_TYPES)[number] = 'sport'
    if (submittedRouteType) {
      resolvedRouteType = submittedRouteType
    } else {
      const { data: existingImageRouteLines } = await supabase
        .from('route_lines')
        .select('climbs (route_type)')
        .eq('image_id', imageId)
        .limit(50)

      const existingTypes = new Set<(typeof VALID_ROUTE_TYPES)[number]>()
      for (const row of (existingImageRouteLines || []) as Array<{ climbs: { route_type: string | null } | { route_type: string | null }[] | null }>) {
        const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
        const normalized = normalizeRouteType(climb?.route_type)
        if (normalized) {
          existingTypes.add(normalized)
        }
      }

      if (existingTypes.size === 1) {
        resolvedRouteType = [...existingTypes][0]
      }
    }

    const usedRouteSlugs = new Set<string>()
    if (image.crag_id) {
      const { data: existingSlugs } = await supabase
        .from('climbs')
        .select('slug')
        .eq('crag_id', image.crag_id)
        .not('slug', 'is', null)
        .limit(10000)

      for (const row of (existingSlugs || []) as Array<{ slug: string | null }>) {
        if (row.slug) usedRouteSlugs.add(row.slug)
      }
    }

    const climbsData = routes.map((route, index) => {
      const trimmedName = route.name.trim()
      const routeNumber = index + 1
      return {
        name: trimmedName || `Route ${routeNumber}`,
        slug: image.crag_id ? makeUniqueSlug(trimmedName || `Route ${routeNumber}`, usedRouteSlugs) : null,
        grade: route.grade,
        description: route.description?.trim() || null,
        route_type: resolvedRouteType,
        status: 'approved' as const,
        user_id: user.id,
        crag_id: image.crag_id,
      }
    })

    const { data: climbs, error: climbsError } = await supabase
      .from('climbs')
      .insert(climbsData)
      .select('id')

    if (climbsError) {
      return createErrorResponse(climbsError, 'Create routes error')
    }

    if (!climbs || climbs.length === 0) {
      return NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })
    }

    const routeLinesData = climbs.map((climb, index) => ({
      image_id: imageId,
      climb_id: climb.id,
      points: routes[index].points,
      color: 'red',
      sequence_order: startingSequenceOrder + index,
      image_width: routes[index].imageWidth,
      image_height: routes[index].imageHeight,
    }))

    const { error: routeLinesError } = await supabase
      .from('route_lines')
      .insert(routeLinesData)

    if (routeLinesError) {
      return createErrorResponse(routeLinesError, 'Create routes error')
    }

    revalidatePath('/')
    if (image.crag_id) {
      const { data: cragData } = await supabase
        .from('crags')
        .select('slug, country_code')
        .eq('id', image.crag_id)
        .single()
      if (cragData?.slug && cragData?.country_code) {
        revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
      }
    }

    return NextResponse.json({
      success: true,
      createdCount: climbs.length,
      message: `Added ${climbs.length} route${climbs.length === 1 ? '' : 's'}`,
    })
  } catch (error) {
    return createErrorResponse(error, 'Create routes error')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
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

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const routes = normalizeRoutes(body?.routes)
    if (!routes || routes.length === 0) {
      return NextResponse.json({ error: 'A valid routes array is required' }, { status: 400 })
    }

    if (routes.length > MAX_ROUTES_PER_REQUEST) {
      return NextResponse.json({ error: `You can update up to ${MAX_ROUTES_PER_REQUEST} routes at once` }, { status: 400 })
    }

    for (const route of routes) {
      if (!route.name.trim()) {
        return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
      }
      if (route.name.trim().length > 200) {
        return NextResponse.json({ error: 'Route name must be 200 characters or less' }, { status: 400 })
      }
      if (route.description && route.description.trim().length > 500) {
        return NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 })
      }
    }

    const { data: updateResult, error: updateError } = await supabase.rpc('update_own_submission', {
      p_image_id: imageId,
      p_image_patch: {},
      p_routes: routes.map((route) => ({
        id: route.id,
        name: route.name.trim(),
        description: route.description?.trim() || null,
        points: route.points,
      })),
      p_route_type: null,
    })

    if (updateError) {
      return createErrorResponse(updateError, 'Update submitted routes error')
    }

    const resultObject = updateResult && typeof updateResult === 'object' && !Array.isArray(updateResult)
      ? updateResult as Record<string, unknown>
      : {}

    revalidatePath('/')
    const { data: image } = await supabase
      .from('images')
      .select('crag_id')
      .eq('id', imageId)
      .single()
    if (image?.crag_id) {
      const { data: cragData } = await supabase
        .from('crags')
        .select('slug, country_code')
        .eq('id', image.crag_id)
        .single()
      if (cragData?.slug && cragData?.country_code) {
        revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: typeof resultObject.updatedRoutes === 'number' ? resultObject.updatedRoutes : routes.length,
      message: 'Routes updated successfully',
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submitted routes error')
  }
}
