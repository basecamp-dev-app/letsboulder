import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse, sanitizeError } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { notifyNewSubmission } from '@/lib/discord'
import { makeUniqueSlug } from '@/lib/slug'
import { revalidatePath } from 'next/cache'

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const INTERNAL_MODERATION_SECRET = process.env.INTERNAL_MODERATION_SECRET

const MAX_ROUTES_PER_DAY = 5

const VALID_GRADES = [
  '3A', '3A+', '3B', '3B+', '3C', '3C+',
  '4A', '4A+', '4B', '4B+', '4C', '4C+',
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const

const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const
const VALID_FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

interface NewImageSubmission {
  mode: 'new'
  imageBucket: string
  imagePath: string
  imageLat: number | null
  imageLng: number | null
  faceDirections: Array<(typeof VALID_FACE_DIRECTIONS)[number]>
  captureDate: string | null
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  cragId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface ExistingImageSubmission {
  mode: 'existing'
  imageId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface NewRouteData {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  imageNaturalWidth: number
  imageNaturalHeight: number
}

interface RoutePoint {
  x: number
  y: number
}

interface PreparedRoute {
  name: string
  grade: string
  description: string | null
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  slug: string | null
}

interface AtomicSubmissionRouteResult {
  climb_id: string
  name: string
  grade: string
}

type SubmissionRequest = NewImageSubmission | ExistingImageSubmission

function normalizeRouteType(value: unknown): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (typeof value !== 'string') return null

  if (!value) return null

  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'

  if (!VALID_ROUTE_TYPES.includes(normalized as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }

  return normalized as (typeof VALID_ROUTE_TYPES)[number]
}

export async function POST(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies

  const debugAuth = process.env.DEBUG_SUBMISSIONS_AUTH === '1'
  const requestUrl = new URL(request.url)

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
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
    if (debugAuth) {
      const requestCookies = cookies.getAll()
      const cookieNames: string[] = []

      if (Array.isArray(requestCookies)) {
        for (const cookie of requestCookies) {
          cookieNames.push(cookie.name)
        }
      }

      const supabaseCookieNames: string[] = []
      for (const name of cookieNames) {
        if (name.startsWith('sb-') || name.toLowerCase().includes('supabase')) {
          supabaseCookieNames.push(name)
        }
      }

      console.log('[submissions] request', {
        host: requestUrl.host,
        path: requestUrl.pathname,
        hasAuthCookies: supabaseCookieNames.length > 0,
        cookieNames: supabaseCookieNames,
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      if (debugAuth) {
        console.warn('[submissions] auth.getUser failed', {
          host: requestUrl.host,
          path: requestUrl.pathname,
          hasUser: Boolean(user),
          authError: authError ? { name: authError.name, message: authError.message } : null,
        })
      }
      response = NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      return response
    }

    if (debugAuth) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      console.log('[submissions] session', {
        userId: user.id,
        hasSession: Boolean(sessionData?.session),
        hasAccessToken: Boolean(sessionData?.session?.access_token),
        sessionUserId: sessionData?.session?.user?.id || null,
        sessionError: sessionError ? { name: sessionError.name, message: sessionError.message } : null,
      })
    }

    const body: SubmissionRequest = await request.json()

    if (!Array.isArray(body.routes) || body.routes.length === 0) {
      response = NextResponse.json({ error: 'At least one route is required' }, { status: 400 })
      return response
    }

    if (body.mode === 'new') {
      if (!Array.isArray(body.faceDirections) || body.faceDirections.length === 0) {
        response = NextResponse.json({ error: 'At least one face direction is required' }, { status: 400 })
        return response
      }

      const hasInvalidFaceDirection = body.faceDirections.some(
        (faceDirection) => !VALID_FACE_DIRECTIONS.includes(faceDirection)
      )

      if (hasInvalidFaceDirection) {
        response = NextResponse.json({ error: 'Invalid face direction value provided' }, { status: 400 })
        return response
      }
    }

    const normalizedRouteType = normalizeRouteType(body.routeType)

    if (body.routeType !== undefined && body.routeType !== null && !normalizedRouteType) {
      response = NextResponse.json({ error: 'Invalid route type' }, { status: 400 })
      return response
    }

    const preparedRoutes: PreparedRoute[] = []
    for (const route of body.routes) {
      if (!route || typeof route !== 'object') {
        response = NextResponse.json({ error: 'Invalid route payload' }, { status: 400 })
        return response
      }

      if (typeof route.name !== 'string') {
        response = NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        return response
      }

      const trimmedRouteName = route.name.trim()
      if (!trimmedRouteName) {
        response = NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        return response
      }

      if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') {
        response = NextResponse.json({ error: 'Route description must be a string' }, { status: 400 })
        return response
      }

      const trimmedDescription = typeof route.description === 'string' ? route.description.trim() : null
      if (trimmedDescription !== null && trimmedDescription.length > 500) {
        response = NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 })
        return response
      }

      if (!VALID_GRADES.includes(route.grade as typeof VALID_GRADES[number])) {
        response = NextResponse.json({ error: `Invalid grade: ${route.grade}` }, { status: 400 })
        return response
      }

      if (!Array.isArray(route.points) || route.points.length < 2) {
        response = NextResponse.json({ error: 'Route must have at least 2 points' }, { status: 400 })
        return response
      }

      if (
        typeof route.sequenceOrder !== 'number' ||
        !Number.isFinite(route.sequenceOrder) ||
        typeof route.imageWidth !== 'number' ||
        !Number.isFinite(route.imageWidth) ||
        typeof route.imageHeight !== 'number' ||
        !Number.isFinite(route.imageHeight)
      ) {
        response = NextResponse.json({ error: 'Route dimensions and sequenceOrder must be valid numbers' }, { status: 400 })
        return response
      }

      for (const point of route.points) {
        if (
          !point ||
          typeof point !== 'object' ||
          typeof point.x !== 'number' ||
          !Number.isFinite(point.x) ||
          typeof point.y !== 'number' ||
          !Number.isFinite(point.y)
        ) {
          response = NextResponse.json({ error: 'Route points must contain valid x/y coordinates' }, { status: 400 })
          return response
        }
      }

      preparedRoutes.push({
        name: trimmedRouteName,
        grade: route.grade,
        description: trimmedDescription,
        points: route.points,
        sequenceOrder: route.sequenceOrder,
        imageWidth: route.imageWidth,
        imageHeight: route.imageHeight,
        slug: null,
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('deleted_at', null)
      .gte('created_at', `${today}T00:00:00`)

    if ((todayRoutes || 0) + preparedRoutes.length > MAX_ROUTES_PER_DAY) {
      response = NextResponse.json({
        error: `Daily limit exceeded. You can submit ${MAX_ROUTES_PER_DAY} routes per day. You have ${(todayRoutes || 0)} already and are trying to submit ${preparedRoutes.length}.`
      }, { status: 429 })
      return response
    }

    let imageId: string | null = null
    let imageUrl: string = ''
    let existingCragId: string | null = null

    if (body.mode === 'new') {
      if (!body.imageBucket) {
        response = NextResponse.json({ error: 'Image bucket is required' }, { status: 400 })
        return response
      }
      if (!body.imagePath) {
        response = NextResponse.json({ error: 'Image path is required' }, { status: 400 })
        return response
      }
      if (!body.cragId) {
        response = NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
        return response
      }

      imageUrl = `private://${body.imageBucket}/${body.imagePath}`

      const insertPayload = {
        url: imageUrl,
        storage_bucket: body.imageBucket,
        storage_path: body.imagePath,
        latitude: body.imageLat,
        longitude: body.imageLng,
        capture_date: body.captureDate,
        face_direction: body.faceDirections[0] || null,
        face_directions: body.faceDirections,
        crag_id: body.cragId,
        width: body.width,
        height: body.height,
        natural_width: body.naturalWidth,
        natural_height: body.naturalHeight,
        created_by: user.id,
      }

      if (debugAuth) {
        console.log('[submissions] image insert payload', {
          created_by: insertPayload.created_by,
          crag_id: insertPayload.crag_id,
          bucket: insertPayload.storage_bucket,
          pathLen: insertPayload.storage_path.length,
          hasLat: insertPayload.latitude !== null,
          hasLng: insertPayload.longitude !== null,
        })
      }

      const imageClient = supabaseAdmin || supabase

      if (!supabaseAdmin) {
        console.warn('[submissions] SUPABASE_SERVICE_ROLE_KEY missing; falling back to RLS insert')
      }

      const { data: image, error: imageError } = await imageClient
        .from('images')
        .insert(insertPayload)
        .select('id')
        .single()

      if (imageError) {
        if (debugAuth) {
          const { data: sessionData } = await supabase.auth.getSession()
          console.error('[submissions] images insert failed', {
            userId: user.id,
            hasAccessToken: Boolean(sessionData?.session?.access_token),
            error: {
              code: imageError.code,
              message: imageError.message,
              details: imageError.details,
              hint: imageError.hint,
            },
          })
        }
        return createErrorResponse(imageError, 'Error creating image')
      }

      imageId = image.id

      if (INTERNAL_MODERATION_SECRET) {
        const csrfToken = request.headers.get('x-csrf-token')
        const cookieHeader = request.headers.get('cookie')
        const moderationHeaders: Record<string, string> = {
          'content-type': 'application/json',
          'x-internal-secret': INTERNAL_MODERATION_SECRET,
        }

        if (csrfToken) {
          moderationHeaders['x-csrf-token'] = csrfToken
        }

        if (cookieHeader) {
          moderationHeaders.cookie = cookieHeader
        }

        fetch(new URL('/api/moderation/check', request.url), {
          method: 'POST',
          headers: moderationHeaders,
          body: JSON.stringify({ imageId: image.id }),
        })
          .then(async (res) => {
            if (res.ok) return

            const text = await res.text().catch(() => '')
            console.error('Failed to queue moderation:', {
              imageId: image.id,
              status: res.status,
              body: text.slice(0, 500),
            })
          })
          .catch((err) => console.error('Failed to queue moderation:', { imageId: image.id, error: err }))
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[submissions] INTERNAL_MODERATION_SECRET missing in non-production; applying auto-approve fallback'
        )

        const { data: publicUrlData } = supabase.storage
          .from(body.imageBucket)
          .getPublicUrl(body.imagePath)

        const approvedUrl = publicUrlData.publicUrl
        const { error: fallbackApprovalError } = await (supabaseAdmin || supabase)
          .from('images')
          .update({
            url: approvedUrl,
            moderation_status: 'approved',
            has_humans: false,
            moderation_labels: [],
            moderated_at: new Date().toISOString(),
            status: 'approved',
          })
          .eq('id', image.id)

        if (fallbackApprovalError) {
          return createErrorResponse(fallbackApprovalError, 'Error applying non-production image approval fallback')
        }
      } else {
        console.warn(
          '[submissions] INTERNAL_MODERATION_SECRET missing in production; image will remain private until moderated manually',
          { imageId: image.id }
        )
      }
    } else {
      if (!body.imageId) {
        response = NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
        return response
      }

      const { data: existingImage, error: imageError } = await supabase
        .from('images')
        .select('id, url, latitude, longitude, crag_id')
        .eq('id', body.imageId)
        .single()

      if (imageError || !existingImage) {
        response = NextResponse.json({ error: 'Image not found' }, { status: 404 })
        return response
      }

      imageId = existingImage.id
      imageUrl = existingImage.url
      existingCragId = existingImage.crag_id
    }

    const cragId = body.mode === 'new' ? body.cragId : existingCragId

    const usedRouteSlugs = new Set<string>()
    if (cragId) {
      const { data: existingSlugs } = await supabase
        .from('climbs')
        .select('slug')
        .eq('crag_id', cragId)
        .not('slug', 'is', null)
        .limit(10000)

      const slugRows = (existingSlugs || []) as Array<{ slug: string | null }>
      for (const row of slugRows) {
        if (row.slug) usedRouteSlugs.add(row.slug)
      }
    }

    await getRegionData(supabase, imageId!)

    for (let index = 0; index < preparedRoutes.length; index += 1) {
      const route = preparedRoutes[index]
      route.slug = cragId ? makeUniqueSlug(route.name || `Route ${index + 1}`, usedRouteSlugs) : null
    }

    const routePayload: Array<{
      name: string
      slug: string | null
      grade: string
      description: string | null
      points: RoutePoint[]
      sequence_order: number
      image_width: number
      image_height: number
    }> = []

    for (const route of preparedRoutes) {
      routePayload.push({
        name: route.name,
        slug: route.slug,
        grade: route.grade,
        description: route.description,
        points: route.points,
        sequence_order: route.sequenceOrder,
        image_width: route.imageWidth,
        image_height: route.imageHeight,
      })
    }

    const { data: climbs, error: atomicError } = await supabase.rpc('create_submission_routes_atomic', {
      p_image_id: imageId!,
      p_crag_id: cragId,
      p_route_type: normalizedRouteType || 'sport',
      p_routes: routePayload,
    })

    if (atomicError) {
      return createErrorResponse(atomicError, 'Error creating submission routes')
    }

    const createdClimbs = (climbs || []) as AtomicSubmissionRouteResult[]
    if (!Array.isArray(createdClimbs) || createdClimbs.length === 0) {
      response = NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 })
      return response
    }

    const notificationClimbs: Array<{ id: string; name: string; grade: string }> = []
    for (const climb of createdClimbs) {
      notificationClimbs.push({
        id: climb.climb_id,
        name: climb.name,
        grade: climb.grade,
      })
    }

    if (cragId) {
      await updateCragBoundary(supabase, cragId)

      const { data: cragData } = await supabase
        .from('crags')
        .select('name, slug, country_code')
        .eq('id', cragId)
        .single()

      const cragName = cragData?.name || 'Unknown Crag'

      await notifyNewSubmission(supabase, notificationClimbs, cragName, cragId, user.id).catch(err => {
        console.error('Discord notification error:', err)
      })

      revalidatePath('/')
      if (cragData?.slug && cragData?.country_code) {
        revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
      }
    }

    response = NextResponse.json({
      success: true,
      climbsCreated: createdClimbs.length,
      routeLinesCreated: routePayload.length,
      imageId: imageId || undefined
    })
    return response
  } catch (error) {
    return createErrorResponse(error, 'Submission error')
  }
}

async function getRegionData(supabase: ReturnType<typeof createServerClient>, imageId: string) {
  try {
    const { data } = await supabase
      .from('images')
      .select(`
        crags:crag_id (
          regions:region_id (
            name
          )
        )
      `)
      .eq('id', imageId)
      .single()

    if (data?.crags?.regions) {
      return data.crags.regions.name
    }
    return ''
  } catch {
    return ''
  }
}

async function updateCragBoundary(supabase: ReturnType<typeof createServerClient>, cragId: string) {
  try {
    const { data: routeData } = await supabase
      .rpc('compute_crag_boundary', { crag_id: cragId })

    if (routeData) {
      await supabase
        .from('crags')
        .update({ boundary: routeData })
        .eq('id', cragId)
    }
  } catch (error) {
    sanitizeError(error, 'Failed to update crag boundary')
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Submission endpoint',
    method: 'POST',
    required_fields: {
      common: ['routes (array with name, grade, points, sequenceOrder)'],
      new_image_mode: ['mode: "new_image"', 'imageUrl', 'imageLat', 'imageLng', 'cragId'],
      existing_image_mode: ['mode: "existing_image"', 'imageId']
    },
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
