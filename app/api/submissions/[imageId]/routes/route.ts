import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { makeUniqueSlug } from '@/lib/slug'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { isValidGrade } from '@/lib/grade-constants'
import { revalidatePath } from 'next/cache'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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

interface DeleteRoutePayload {
  routeLineId: string
  transferLogsToSameName?: boolean
  targetRouteLineId?: string | null
}

interface TransferTargetCandidate {
  routeLineId: string
  climbId: string
  climbName: string
  grade: string | null
}

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

function normalizeDeletePayload(value: unknown): DeleteRoutePayload | null {
  if (!value || typeof value !== 'object') return null

  const routeLineId = typeof (value as { routeLineId?: unknown }).routeLineId === 'string'
    ? (value as { routeLineId: string }).routeLineId.trim()
    : ''

  if (!routeLineId) return null

  const transferLogsToSameName = typeof (value as { transferLogsToSameName?: unknown }).transferLogsToSameName === 'boolean'
    ? (value as { transferLogsToSameName: boolean }).transferLogsToSameName
    : true

  const targetRouteLineIdRaw = (value as { targetRouteLineId?: unknown }).targetRouteLineId
  const targetRouteLineId = typeof targetRouteLineIdRaw === 'string' && targetRouteLineIdRaw.trim().length > 0
    ? targetRouteLineIdRaw.trim()
    : null

  return {
    routeLineId,
    transferLogsToSameName,
    targetRouteLineId,
  }
}

function normalizeRouteNameForMatch(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
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

  const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY,
        { cookies: { getAll() { return [] }, setAll() {} } }
      )
    : null

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
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
      if (!isValidGrade(route.grade)) {
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

    const imageOwnerId = typeof image.created_by === 'string' ? image.created_by : null
    if (!imageOwnerId) {
      return NextResponse.json({ error: 'This submission is not editable' }, { status: 403 })
    }

    if (imageOwnerId !== userId) {
      const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_collaborators')
        .select('image_id')
        .eq('image_id', imageId)
        .eq('user_id', userId)
        .maybeSingle()

      if (collaboratorError || !collaboratorAccess) {
        return NextResponse.json({ error: 'Only the owner or a collaborator can add routes to this image' }, { status: 403 })
      }
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
        user_id: imageOwnerId,
        crag_id: image.crag_id,
      }
    })

    const writeClient = supabaseAdmin || supabase

    const { data: climbs, error: climbsError } = await writeClient
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

    const { error: routeLinesError } = await writeClient
      .from('route_lines')
      .insert(routeLinesData)

    if (routeLinesError) {
      return createErrorResponse(routeLinesError, 'Create routes error')
    }

    const { data: collaboratorRows, error: collaboratorsError } = await supabase
      .from('submission_collaborators')
      .select('user_id')
      .eq('image_id', imageId)

    if (collaboratorsError) {
      return createErrorResponse(collaboratorsError, 'Create routes error')
    }

    const voterUserIds = Array.from(new Set([
      imageOwnerId,
      ...((collaboratorRows || [])
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === 'string' && !!id)),
    ]))

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Service role key missing' }, { status: 500 })
    }

    const gradeVoteRows = climbs.flatMap((climb, index) => {
      const grade = routes[index]?.grade
      if (!grade) return []
      return voterUserIds.map((voterUserId) => ({
        climb_id: climb.id,
        user_id: voterUserId,
        grade,
      }))
    })

    if (gradeVoteRows.length > 0) {
      const { error: gradeVotesError } = await supabaseAdmin
        .from('grade_votes')
        .upsert(gradeVoteRows, { onConflict: 'climb_id,user_id' })

      if (gradeVotesError) {
        return createErrorResponse(gradeVotesError, 'Create routes error')
      }
    }

    await writeClient
      .from('images')
      .update({ last_edited_by: userId })
      .eq('id', imageId)

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

export async function DELETE(
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

  const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY,
        { cookies: { getAll() { return [] }, setAll() {} } }
      )
    : null

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { imageId } = await params
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const payload = normalizeDeletePayload(body)
    if (!payload) {
      return NextResponse.json({ error: 'A valid routeLineId is required' }, { status: 400 })
    }

    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('id, created_by, crag_id')
      .eq('id', imageId)
      .maybeSingle()

    if (imageError) {
      return createErrorResponse(imageError, 'Delete route error')
    }

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const ownerId = typeof image.created_by === 'string' ? image.created_by : null
    if (!ownerId) {
      return NextResponse.json({ error: 'This submission is not editable' }, { status: 403 })
    }

    let hasAccess = ownerId === userId
    if (!hasAccess) {
      const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_collaborators')
        .select('image_id')
        .eq('image_id', imageId)
        .eq('user_id', userId)
        .maybeSingle()

      if (collaboratorError) {
        return createErrorResponse(collaboratorError, 'Delete route error')
      }

      hasAccess = !!collaboratorAccess
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Only the owner or a collaborator can delete routes for this image' }, { status: 403 })
    }

    const { data: currentRouteLine, error: routeLineError } = await supabase
      .from('route_lines')
      .select('id, climb_id, climbs(name)')
      .eq('id', payload.routeLineId)
      .eq('image_id', imageId)
      .maybeSingle()

    if (routeLineError) {
      return createErrorResponse(routeLineError, 'Delete route error')
    }

    if (!currentRouteLine) {
      return NextResponse.json({ error: 'Route not found for this submission' }, { status: 404 })
    }

    const currentRouteClimb = pickOne(currentRouteLine.climbs as { name: string | null } | Array<{ name: string | null }> | null)
    const currentRouteName = currentRouteClimb?.name || ''
    const oldClimbId = currentRouteLine.climb_id

    const writeClient = supabaseAdmin || supabase

    let targetClimbId: string | null = null
    if (payload.transferLogsToSameName && currentRouteName.trim().length > 0) {
      const { data: siblingRouteLines, error: siblingError } = await supabase
        .from('route_lines')
        .select('id, climb_id, sequence_order, climbs(name, grade)')
        .eq('image_id', imageId)
        .neq('id', payload.routeLineId)

      if (siblingError) {
        return createErrorResponse(siblingError, 'Delete route error')
      }

      const sourceName = normalizeRouteNameForMatch(currentRouteName)
      const candidates: TransferTargetCandidate[] = (siblingRouteLines || []).map((routeLine) => {
        const climb = pickOne(routeLine.climbs as { name: string | null; grade: string | null } | Array<{ name: string | null; grade: string | null }> | null)
        return {
          routeLineId: routeLine.id,
          climbId: routeLine.climb_id,
          climbName: climb?.name || '',
          grade: climb?.grade || null,
        }
      }).filter((candidate) => normalizeRouteNameForMatch(candidate.climbName) === sourceName)

      if (payload.targetRouteLineId) {
        const selectedTarget = candidates.find((candidate) => candidate.routeLineId === payload.targetRouteLineId)
        if (!selectedTarget) {
          return NextResponse.json({ error: 'Selected transfer target is invalid' }, { status: 400 })
        }
        targetClimbId = selectedTarget.climbId
      } else if (candidates.length > 1) {
        return NextResponse.json({
          error: 'Multiple matching routes found. Choose a transfer target before deleting.',
          code: 'multiple_transfer_targets',
          sourceRouteName: currentRouteName,
          candidates: candidates.map((candidate) => ({
            routeLineId: candidate.routeLineId,
            climbName: candidate.climbName,
            grade: candidate.grade,
          })),
        }, { status: 409 })
      } else if (candidates.length === 1) {
        targetClimbId = candidates[0].climbId
      }
    }

    let movedLogs = 0
    let droppedDuplicateLogs = 0

    if (targetClimbId && targetClimbId !== oldClimbId) {
      const { data: oldLogs, error: oldLogsError } = await writeClient
        .from('user_climbs')
        .select('id, user_id')
        .eq('climb_id', oldClimbId)

      if (oldLogsError) {
        return createErrorResponse(oldLogsError, 'Delete route error')
      }

      const oldLogsByUserId = new Map<string, string>()
      for (const oldLog of oldLogs || []) {
        if (typeof oldLog.user_id !== 'string' || typeof oldLog.id !== 'string') continue
        oldLogsByUserId.set(oldLog.user_id, oldLog.id)
      }

      if (oldLogsByUserId.size > 0) {
        const userIds = [...oldLogsByUserId.keys()]
        const { data: targetLogs, error: targetLogsError } = await writeClient
          .from('user_climbs')
          .select('user_id')
          .eq('climb_id', targetClimbId)
          .in('user_id', userIds)

        if (targetLogsError) {
          return createErrorResponse(targetLogsError, 'Delete route error')
        }

        const usersWithTargetLog = new Set(
          (targetLogs || [])
            .map((row) => row.user_id)
            .filter((userId): userId is string => typeof userId === 'string')
        )

        for (const [oldUserId, oldLogId] of oldLogsByUserId.entries()) {
          if (usersWithTargetLog.has(oldUserId)) {
            const { error: deleteDuplicateError } = await writeClient
              .from('user_climbs')
              .delete()
              .eq('id', oldLogId)

            if (deleteDuplicateError) {
              return createErrorResponse(deleteDuplicateError, 'Delete route error')
            }
            droppedDuplicateLogs += 1
            continue
          }

          const { error: moveLogError } = await writeClient
            .from('user_climbs')
            .update({ climb_id: targetClimbId })
            .eq('id', oldLogId)

          if (moveLogError) {
            return createErrorResponse(moveLogError, 'Delete route error')
          }
          movedLogs += 1
        }
      }
    }

    const { error: deleteClimbError } = await writeClient
      .from('climbs')
      .delete()
      .eq('id', oldClimbId)

    if (deleteClimbError) {
      return createErrorResponse(deleteClimbError, 'Delete route error')
    }

    await writeClient
      .from('images')
      .update({ last_edited_by: userId })
      .eq('id', imageId)

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
      movedLogs,
      droppedDuplicateLogs,
    })
  } catch (error) {
    return createErrorResponse(error, 'Delete route error')
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
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
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

    const { data: updateResult, error: updateError } = await supabase.rpc('update_own_submitted_routes', {
      p_image_id: imageId,
      p_routes: routes.map((route) => ({
        id: route.id,
        name: route.name.trim(),
        description: route.description?.trim() || null,
        points: route.points,
      })),
    })

    if (updateError) {
      const message = (updateError.message || '').toLowerCase()
      if (message.includes('permission')) {
        return NextResponse.json({ error: 'Only the owner or a collaborator can edit routes for this image' }, { status: 403 })
      }
      return createErrorResponse(updateError, 'Update submitted routes error')
    }

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
      updatedCount: typeof updateResult === 'number' ? updateResult : routes.length,
      message: 'Routes updated successfully',
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submitted routes error')
  }
}
