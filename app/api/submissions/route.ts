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
  images: NewSubmissionImage[]
  primaryIndex: number
  cragId: string
  faceDirections: Array<(typeof VALID_FACE_DIRECTIONS)[number]>
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface NewSubmissionImage {
  uploadedBucket: string
  uploadedPath: string
  uploadedUrl?: string
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  captureDate: string | null
  gpsData: {
    latitude: number
    longitude: number
  } | null
}

interface ExistingImageSubmission {
  mode: 'existing'
  imageId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

interface CragImageSubmission {
  mode: 'crag_image'
  cragImageId: string
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

interface UnifiedSubmissionResult {
  image_id: string
  crag_id: string
  climb_ids: string[]
  route_line_ids: string[]
  crag_image_ids: string[]
  climbs_created: number
  route_lines_created: number
  supplementary_created: number
}

type SubmissionRequest = NewImageSubmission | ExistingImageSubmission | CragImageSubmission

function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null

  return { bucket, path }
}

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

  let uploadedBlobsToCleanup: Array<{ bucket: string; path: string }> = []
  let shouldCleanupUploadedBlobs = false

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
    let existingCragId: string | null = null
    let notificationClimbs: Array<{ id: string; name: string; grade: string }> = []
    let climbsCreatedCount = 0
    let routeLinesCreatedCount = 0
    let supplementaryCreatedCount = 0
    let supplementaryCragImageIds: string[] = []
    let primaryNewImage: NewSubmissionImage | null = null
    let validatedNewImages: NewSubmissionImage[] = []

    if (body.mode === 'new') {
      if (!body.cragId) {
        response = NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
        return response
      }

      if (!Array.isArray(body.images) || body.images.length === 0) {
        response = NextResponse.json({ error: 'At least one image is required' }, { status: 400 })
        return response
      }

      if (!Number.isInteger(body.primaryIndex) || body.primaryIndex < 0 || body.primaryIndex >= body.images.length) {
        response = NextResponse.json({ error: 'Invalid primary index' }, { status: 400 })
        return response
      }

      const userPathPrefix = `${user.id}/`
      validatedNewImages = []

      for (const image of body.images) {
        if (!image || typeof image !== 'object') {
          response = NextResponse.json({ error: 'Invalid image payload' }, { status: 400 })
          return response
        }

        if (!image.uploadedBucket || typeof image.uploadedBucket !== 'string') {
          response = NextResponse.json({ error: 'Image uploadedBucket is required' }, { status: 400 })
          return response
        }

        if (!image.uploadedPath || typeof image.uploadedPath !== 'string') {
          response = NextResponse.json({ error: 'Image uploadedPath is required' }, { status: 400 })
          return response
        }

        if (!image.uploadedPath.startsWith(userPathPrefix)) {
          response = NextResponse.json({ error: 'Invalid image path owner' }, { status: 403 })
          return response
        }

        if (
          !Number.isFinite(image.width) ||
          !Number.isFinite(image.height) ||
          !Number.isFinite(image.naturalWidth) ||
          !Number.isFinite(image.naturalHeight)
        ) {
          response = NextResponse.json({ error: 'Image dimensions are required' }, { status: 400 })
          return response
        }

        validatedNewImages.push(image)
      }

      primaryNewImage = validatedNewImages[body.primaryIndex]
    } else if (body.mode === 'existing') {
      if (!body.imageId) {
        response = NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
        return response
      }

      const { data: existingImage, error: imageError } = await supabase
        .from('images')
        .select('id, crag_id')
        .eq('id', body.imageId)
        .single()

      if (imageError || !existingImage) {
        response = NextResponse.json({ error: 'Image not found' }, { status: 404 })
        return response
      }

      imageId = existingImage.id
      existingCragId = existingImage.crag_id
    } else {
      if (!body.cragImageId) {
        response = NextResponse.json({ error: 'Crag image ID is required' }, { status: 400 })
        return response
      }

      const { data: cragImage, error: cragImageError } = await supabase
        .from('crag_images')
        .select('id, url, crag_id, width, height, source_image_id, linked_image_id')
        .eq('id', body.cragImageId)
        .single()

      if (cragImageError || !cragImage) {
        response = NextResponse.json({ error: 'Crag image not found' }, { status: 404 })
        return response
      }

      existingCragId = cragImage.crag_id

      if (!existingCragId) {
        response = NextResponse.json({ error: 'Crag image is not attached to a crag' }, { status: 400 })
        return response
      }

      let resolvedImageId = cragImage.linked_image_id
      const shouldCreateLinkedImage = !resolvedImageId || (cragImage.source_image_id && resolvedImageId === cragImage.source_image_id)

      if (shouldCreateLinkedImage) {
        const parsedStorage = parsePrivateStorageUrl(cragImage.url)
        const insertPayload: Record<string, unknown> = {
          url: cragImage.url,
          crag_id: existingCragId,
          width: cragImage.width,
          height: cragImage.height,
          natural_width: cragImage.width,
          natural_height: cragImage.height,
          created_by: user.id,
          latitude: null,
          longitude: null,
          capture_date: null,
        }

        if (parsedStorage) {
          insertPayload.storage_bucket = parsedStorage.bucket
          insertPayload.storage_path = parsedStorage.path
        }

        const imageClient = supabaseAdmin || supabase
        const { data: createdImage, error: createImageError } = await imageClient
          .from('images')
          .insert(insertPayload)
          .select('id')
          .single()

        if (createImageError || !createdImage) {
          return createErrorResponse(createImageError || new Error('Failed to create linked image'), 'Error creating linked image')
        }

        resolvedImageId = createdImage.id

        const linkingClient = supabaseAdmin || supabase
        const { error: linkError } = await linkingClient
          .from('crag_images')
          .update({ linked_image_id: resolvedImageId })
          .eq('id', cragImage.id)

        if (linkError) {
          return createErrorResponse(linkError, 'Error linking crag image to created image')
        }

        const { data: latestCragImage, error: latestCragImageError } = await linkingClient
          .from('crag_images')
          .select('linked_image_id')
          .eq('id', cragImage.id)
          .single()

        if (latestCragImageError) {
          return createErrorResponse(latestCragImageError, 'Error verifying linked crag image')
        }

        if (latestCragImage?.linked_image_id) {
          resolvedImageId = latestCragImage.linked_image_id
        } else {
          return NextResponse.json({ error: 'Failed to persist crag image link' }, { status: 500 })
        }
      }

      imageId = resolvedImageId
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

    if (body.mode === 'new') {
      if (!primaryNewImage) {
        response = NextResponse.json({ error: 'Primary image missing' }, { status: 400 })
        return response
      }

      uploadedBlobsToCleanup = validatedNewImages.map((img) => ({
        bucket: img.uploadedBucket,
        path: img.uploadedPath,
      }))
      shouldCleanupUploadedBlobs = true

      const primaryPayload = {
        url: `private://${primaryNewImage.uploadedBucket}/${primaryNewImage.uploadedPath}`,
        storage_bucket: primaryNewImage.uploadedBucket,
        storage_path: primaryNewImage.uploadedPath,
        image_lat: primaryNewImage.gpsData?.latitude ?? null,
        image_lng: primaryNewImage.gpsData?.longitude ?? null,
        capture_date: primaryNewImage.captureDate,
        width: primaryNewImage.width,
        height: primaryNewImage.height,
        natural_width: primaryNewImage.naturalWidth,
        natural_height: primaryNewImage.naturalHeight,
        face_directions: body.faceDirections,
      }

      const supplementaryPayload = validatedNewImages
        .filter((_, index) => index !== body.primaryIndex)
        .map((img) => ({
          url: `private://${img.uploadedBucket}/${img.uploadedPath}`,
          width: img.width,
          height: img.height,
        }))

      const { data: unifiedData, error: unifiedError } = await supabase.rpc('create_unified_submission_atomic', {
        p_crag_id: body.cragId,
        p_primary_image: primaryPayload,
        p_supplementary_images: supplementaryPayload,
        p_routes: routePayload,
        p_route_type: normalizedRouteType || 'sport',
      })

      if (unifiedError) {
        throw unifiedError
      }

      const unifiedResult = (Array.isArray(unifiedData) ? unifiedData[0] : unifiedData) as UnifiedSubmissionResult | null
      if (!unifiedResult?.image_id) {
        throw new Error('Unified submission did not return image_id')
      }

      imageId = unifiedResult.image_id
      climbsCreatedCount = unifiedResult.climbs_created || 0
      routeLinesCreatedCount = unifiedResult.route_lines_created || routePayload.length
      supplementaryCreatedCount = unifiedResult.supplementary_created || 0
      supplementaryCragImageIds = Array.isArray(unifiedResult.crag_image_ids) ? unifiedResult.crag_image_ids : []

      const createdClimbIds = Array.isArray(unifiedResult.climb_ids) ? unifiedResult.climb_ids : []
      if (createdClimbIds.length > 0) {
        const { data: createdClimbsRows } = await supabase
          .from('climbs')
          .select('id, name, grade')
          .in('id', createdClimbIds)

        notificationClimbs = (createdClimbsRows || []).map((row) => ({
          id: row.id,
          name: row.name || 'Unnamed',
          grade: row.grade,
        }))
      }

      if (notificationClimbs.length === 0) {
        notificationClimbs = preparedRoutes.map((route, index) => ({
          id: `route-${index + 1}`,
          name: route.name,
          grade: route.grade,
        }))
      }

      await getRegionData(supabase, imageId)

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
          body: JSON.stringify({ imageId }),
        })
          .then(async (res) => {
            if (res.ok) return
            const text = await res.text().catch(() => '')
            console.error('Failed to queue moderation:', {
              imageId,
              status: res.status,
              body: text.slice(0, 500),
            })
          })
          .catch((err) => console.error('Failed to queue moderation:', { imageId, error: err }))
      }
    } else {
      if (!imageId) {
        response = NextResponse.json({ error: 'Failed to resolve image for submission' }, { status: 500 })
        return response
      }

      await getRegionData(supabase, imageId)

      const { data: climbs, error: atomicError } = await supabase.rpc('create_submission_routes_atomic', {
        p_image_id: imageId,
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

      notificationClimbs = createdClimbs.map((climb) => ({
        id: climb.climb_id,
        name: climb.name,
        grade: climb.grade,
      }))
      climbsCreatedCount = createdClimbs.length
      routeLinesCreatedCount = routePayload.length
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
      climbsCreated: climbsCreatedCount,
      routeLinesCreated: routeLinesCreatedCount,
      supplementaryImagesCreated: supplementaryCreatedCount,
      supplementaryCragImageIds,
      imageId: imageId || undefined
    })
    shouldCleanupUploadedBlobs = false
    return response
  } catch (error) {
    if (shouldCleanupUploadedBlobs && uploadedBlobsToCleanup.length > 0) {
      const pathsByBucket = new Map<string, string[]>()

      for (const item of uploadedBlobsToCleanup) {
        if (!item.bucket || !item.path) continue
        const current = pathsByBucket.get(item.bucket) || []
        current.push(item.path)
        pathsByBucket.set(item.bucket, current)
      }

      for (const [bucket, paths] of pathsByBucket.entries()) {
        if (paths.length === 0) continue
        await supabase.storage.from(bucket).remove(Array.from(new Set(paths))).catch(() => {})
      }
    }

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
      new_image_mode: ['mode: "new"', 'images[]', 'primaryIndex', 'faceDirections', 'cragId'],
      existing_image_mode: ['mode: "existing"', 'imageId'],
      crag_image_mode: ['mode: "crag_image"', 'cragImageId']
    },
    rate_limit: `${MAX_ROUTES_PER_DAY} routes per day`
  })
}
