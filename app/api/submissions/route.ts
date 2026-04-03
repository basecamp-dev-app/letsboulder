import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { notifyNewSubmission } from '@/lib/discord'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import { makeUniqueSlug } from '@/lib/slug'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { serverEnv } from '@/lib/env'
import { revalidatePath } from 'next/cache'
import { getMediaModerationConfig } from '@/lib/media/config'
import { getSubmissionInfo, MAX_ROUTES_PER_DAY } from '@/features/submissions/server/submissions/submit-route-info'
import { getRegionData } from '@/features/submissions/server/submissions/submission-route-shared'
import { buildSubmissionSuccessResponse, cleanupUploadedBlobs, submissionErrorResponse, type SubmissionExecutionResult } from '@/features/submissions/server/submissions/submit-shared'
import { executeExistingImageSubmission } from '@/features/submissions/server/submissions/submit-existing-image'
import { executeNewImageSubmission } from '@/features/submissions/server/submissions/submit-new-image'
import { resolveCragImageToImageId } from '@/features/submissions/server/submissions/submit-crag-image'
import {
  validateAndPrepareRoutes,
  validateNewSubmissionInput,
  type NewSubmissionImage,
  type SubmissionRequest,
} from '@/features/submissions/server/submissions/submit-route-validation'
import { getServerClientFromRequest, getAdminClient } from '@/lib/supabase-server'
import { parseWithSchema } from '@/lib/api-validation'
import { submissionRequestSchema } from '@/features/submissions/server/submissions/submit-route-schema'

const INTERNAL_MODERATION_SECRET = serverEnv.INTERNAL_MODERATION_SECRET

interface RoutePoint {
  x: number
  y: number
}

export async function POST(request: NextRequest) {
  const middlewareResult = await withApiMiddleware(request, { requireUser: false })
  if (!middlewareResult.ok) return middlewareResult.response

  const debugAuth = serverEnv.DEBUG_SUBMISSIONS_AUTH === '1'
  const requestUrl = new URL(request.url)

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = getServerClientFromRequest(request)

  const supabaseAdmin = getAdminClient()

  let uploadedBlobsToCleanup: Array<{ bucket: string; path: string }> = []
  let shouldCleanupUploadedBlobs = false

  try {
    const ownershipClient = supabase as unknown as Parameters<typeof userOwnsUploadedObject>[0]
    if (debugAuth) {
      const requestCookies = request.cookies.getAll()
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


    }

    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (authError || !userId) {
      if (debugAuth) {
        console.warn('[submissions] auth.getUser failed', {
          host: requestUrl.host,
          path: requestUrl.pathname,
          hasUser: Boolean(userId),
          authError: authError ? {
            name: (authError as { name?: string }).name,
            message: (authError as { message?: string }).message,
          } : null,
        })
      }
      response = NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      return response
    }

    const parsedBody = parseWithSchema(submissionRequestSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const body: SubmissionRequest = parsedBody.data

    const routeValidation = validateAndPrepareRoutes(body)
    if (routeValidation.error) return routeValidation.error
    const preparedRoutes = routeValidation.preparedRoutes
    const normalizedRouteType = routeValidation.normalizedRouteType

    const newSubmissionValidation = validateNewSubmissionInput(body)
    if (newSubmissionValidation.error) return newSubmissionValidation.error
    const normalizedFaceDirectionsByImage = newSubmissionValidation.normalizedFaceDirectionsByImage

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
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
    let executionResult: SubmissionExecutionResult | null = null
    const primaryNewImage: NewSubmissionImage | null = newSubmissionValidation.primaryNewImage
    const validatedNewImages: NewSubmissionImage[] = newSubmissionValidation.validatedNewImages

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

      for (const image of body.images) {
        if (!(await userOwnsUploadedObject(ownershipClient, userId, image.uploadedBucket, image.uploadedPath))) {
          response = NextResponse.json({ error: 'Invalid image path owner' }, { status: 403 })
          return response
        }
      }

      const newResult = await executeNewImageSubmission({
        supabase,
        supabaseAdmin,
        createErrorResponse,
        body,
        validatedNewImages,
        primaryNewImage,
        normalizedFaceDirectionsByImage,
        routePayload,
        normalizedRouteType,
        preparedRoutes,
      })
      if (newResult.error) return newResult.error
      executionResult = newResult.result
      uploadedBlobsToCleanup = executionResult.cleanupUploadedBlobs || []
      shouldCleanupUploadedBlobs = uploadedBlobsToCleanup.length > 0
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

      const cragResolution = await resolveCragImageToImageId({
        supabase,
        supabaseAdmin,
        createErrorResponse,
        cragImageId: body.cragImageId,
        userId,
      })
      if (cragResolution.error) return cragResolution.error
      imageId = cragResolution.imageId
      existingCragId = cragResolution.cragId
    }

    if (body.mode !== 'new') {
      if (!imageId) {
        response = NextResponse.json({ error: 'Failed to resolve image for submission' }, { status: 500 })
        return response
      }

      const existingResult = await executeExistingImageSubmission({
        supabase,
        supabaseAdmin,
        createErrorResponse,
        imageId,
        cragId,
        routePayload,
        normalizedRouteType,
      })
      if (existingResult.error) return existingResult.error
      executionResult = existingResult.result
    }

    if (!executionResult) {
      response = NextResponse.json({ error: 'Submission execution failed' }, { status: 500 })
      return response
    }

    imageId = executionResult.imageId
    await getRegionData(supabase, imageId)

    if (body.mode === 'new') {
      const moderationConfig = getMediaModerationConfig()
      if (INTERNAL_MODERATION_SECRET && moderationConfig.enabled) {
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
    }

    if (cragId) {
      const { data: cragData } = await supabase
        .from('crags')
        .select('name, slug, country_code')
        .eq('id', cragId)
        .single()

      const cragName = cragData?.name || 'Unknown Crag'

      await notifyNewSubmission(supabase, executionResult.notificationClimbs, cragName, cragId, userId).catch(err => {
        console.error('Discord notification error:', err)
      })

      revalidatePath('/')
      if (cragData?.slug && cragData?.country_code) {
        revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
      }
    }

    const successPayload: SubmissionExecutionResult = {
      ...executionResult,
    }

    response = buildSubmissionSuccessResponse(successPayload)
    shouldCleanupUploadedBlobs = false
    return response
  } catch (error) {
    if (shouldCleanupUploadedBlobs && uploadedBlobsToCleanup.length > 0) {
      await cleanupUploadedBlobs(supabase, uploadedBlobsToCleanup)
    }

    return submissionErrorResponse(error)
  }
}

export async function GET() {
  return getSubmissionInfo()
}
