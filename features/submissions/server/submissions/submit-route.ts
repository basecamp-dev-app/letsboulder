import { notifyNewSubmission } from '@/lib/discord'
import { userOwnsUploadedObject } from '@/lib/media/ownership'
import { makeUniqueSlug, fetchUsedSlugs } from '@/lib/slug'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { serverEnv } from '@/lib/env.server'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { parseWithSchema } from '@/lib/api-validation'
import { reportError } from '@/lib/errors'
import { submissionRequestSchema } from '@/features/submissions/server/submissions/submit-route-schema'
import { getRegionData } from '@/features/submissions/server/submissions/submission-route-shared'
import { buildSubmissionSuccessResponse, cleanupUploadedBlobs, submissionErrorResponse, type SubmissionExecutionResult } from '@/features/submissions/server/submissions/submit-shared'
import { executeExistingImageSubmission } from '@/features/submissions/server/submissions/submit-existing-image'
import { executeNewImageSubmission } from '@/features/submissions/server/submissions/submit-new-image'
import { resolveCragImageToImageId } from '@/features/submissions/server/submissions/submit-crag-image'
import { validateAndPrepareRoutes, validateNewSubmissionInput, type NewSubmissionImage, type SubmissionRequest } from '@/features/submissions/server/submissions/submit-route-validation'

import type { NextRequest } from 'next/server'

interface RoutePoint {
  x: number
  y: number
}

export const MAX_ROUTES_PER_DAY = 5

async function runSubmissionSideEffects(
  supabase: ReturnType<typeof getServerClientFromRequest>,
  input: { imageId: string; cragId: string | null; userId: string; executionResult: SubmissionExecutionResult }
) {
  await getRegionData(supabase, input.imageId)

  if (!input.cragId) return

  const { data: cragData } = await supabase
    .from('crags')
    .select('name, slug, country_code')
    .eq('id', input.cragId)
    .single()

  const cragName = cragData?.name || 'Unknown Crag'

  await notifyNewSubmission(supabase, input.executionResult.notificationClimbs, cragName, input.cragId, input.userId).catch((error) => {
    reportError(error, { message: 'Discord notification error' })
  })

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/')
  if (cragData?.slug && cragData?.country_code) {
    revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
  }
}

export async function submitRoute(request: NextRequest) {
  const debugAuth = serverEnv.DEBUG_SUBMISSIONS_AUTH === '1'
  const requestUrl = new URL(request.url)
  const supabase = getServerClientFromRequest(request)
  const supabaseAdmin = getAdminClientWithAudit('submit new submission')

  let uploadedBlobsToCleanup: Array<{ bucket: string; path: string }> = []
  let shouldCleanupUploadedBlobs = false

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (authError || !userId) {
      if (debugAuth) {
        reportError(authError ?? new Error('Missing user during submission auth'), {
          message: '[submissions] auth.getUser failed',
          level: 'warning',
          extra: {
            host: requestUrl.host,
            path: requestUrl.pathname,
            hasUser: Boolean(userId),
            authError: authError ? {
              name: (authError as { name?: string }).name,
              message: (authError as { message?: string }).message,
            } : null,
          },
        })
      }
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const parsedBody = parseWithSchema(submissionRequestSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const body: SubmissionRequest = parsedBody.data

    const routeValidation = validateAndPrepareRoutes(body)
    if (routeValidation.error) return routeValidation.error

    const newSubmissionValidation = validateNewSubmissionInput(body)
    if (newSubmissionValidation.error) return newSubmissionValidation.error

    const preparedRoutes = routeValidation.preparedRoutes
    const normalizedRouteType = routeValidation.normalizedRouteType
    const normalizedFaceDirectionsByImage = newSubmissionValidation.normalizedFaceDirectionsByImage
    const primaryNewImage: NewSubmissionImage | null = newSubmissionValidation.primaryNewImage
    const validatedNewImages: NewSubmissionImage[] = newSubmissionValidation.validatedNewImages

    const today = new Date().toISOString().split('T')[0]
    const { count: todayRoutes } = await supabase
      .from('climbs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('deleted_at', null)
      .gte('created_at', `${today}T00:00:00`)

    if ((todayRoutes || 0) + preparedRoutes.length > MAX_ROUTES_PER_DAY) {
      return Response.json({
        error: `Daily limit exceeded. You can submit ${MAX_ROUTES_PER_DAY} routes per day. You have ${(todayRoutes || 0)} already and are trying to submit ${preparedRoutes.length}.`,
      }, { status: 429 })
    }

    let imageId: string | null = null
    let existingCragId: string | null = null
    let executionResult: SubmissionExecutionResult | null = null
    const cragId = body.mode === 'new' ? body.cragId : existingCragId

    const usedRouteSlugs = cragId
      ? await fetchUsedSlugs(supabase, 'climbs', { crag_id: cragId })
      : new Set<string>()

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
    }> = preparedRoutes.map((route) => ({
      name: route.name,
      slug: route.slug,
      grade: route.grade,
      description: route.description,
      points: route.points,
      sequence_order: route.sequenceOrder,
      image_width: route.imageWidth,
      image_height: route.imageHeight,
    }))

    if (body.mode === 'new') {
      if (!primaryNewImage) {
        return Response.json({ error: 'Primary image missing' }, { status: 400 })
      }

      for (const image of body.images) {
        if (!(await userOwnsUploadedObject(supabase, userId, image.uploadedBucket, image.uploadedPath))) {
          return Response.json({ error: 'Invalid image path owner' }, { status: 403 })
        }
      }

      const newResult = await executeNewImageSubmission({
        supabase,
        supabaseAdmin,
        createErrorResponse: submissionErrorResponse,
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
        return Response.json({ error: 'Image ID is required' }, { status: 400 })
      }

      const { data: existingImage, error: imageError } = await supabase
        .from('images')
        .select('id, crag_id, processing_status, moderation_status, visibility, status')
        .eq('id', body.imageId)
        .single()

      if (imageError || !existingImage) {
        return Response.json({ error: 'Image not found' }, { status: 404 })
      }

      imageId = existingImage.id
      existingCragId = existingImage.crag_id
    } else {
      if (!body.cragImageId) {
        return Response.json({ error: 'Crag image ID is required' }, { status: 400 })
      }

      const cragResolution = await resolveCragImageToImageId({
        supabase,
        supabaseAdmin,
        createErrorResponse: submissionErrorResponse,
        cragImageId: body.cragImageId,
        userId,
      })
      if (cragResolution.error) return cragResolution.error
      imageId = cragResolution.imageId
      existingCragId = cragResolution.cragId
    }

    const resolvedCragId = body.mode === 'new' ? body.cragId : existingCragId

    if (body.mode !== 'new') {
      if (!imageId) {
        return Response.json({ error: 'Failed to resolve image for submission' }, { status: 500 })
      }

      const existingResult = await executeExistingImageSubmission({
        supabase,
        supabaseAdmin,
        userId,
        createErrorResponse: submissionErrorResponse,
        imageId,
        cragId: resolvedCragId,
        routePayload,
        normalizedRouteType,
      })
      if (existingResult.error) return existingResult.error
      executionResult = existingResult.result
    }

    if (!executionResult) {
      return Response.json({ error: 'Submission execution failed' }, { status: 500 })
    }

    imageId = executionResult.imageId
    await runSubmissionSideEffects(supabase, {
      imageId,
      cragId: resolvedCragId,
      userId,
      executionResult,
    })

    shouldCleanupUploadedBlobs = false
    return buildSubmissionSuccessResponse({ ...executionResult })
  } catch (error) {
    if (shouldCleanupUploadedBlobs && uploadedBlobsToCleanup.length > 0) {
      await cleanupUploadedBlobs(supabase, uploadedBlobsToCleanup)
    }

    return submissionErrorResponse(error)
  }
}
