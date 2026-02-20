import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'

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

const MAX_ROUTES_PER_REQUEST = 40

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

    return NextResponse.json({
      success: true,
      updatedCount: typeof resultObject.updatedRoutes === 'number' ? resultObject.updatedRoutes : routes.length,
      message: 'Routes updated successfully',
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submitted routes error')
  }
}
