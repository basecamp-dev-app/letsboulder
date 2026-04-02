import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { revalidatePath } from 'next/cache'
import { FACE_DIRECTIONS, type FaceDirection } from '@/features/submissions/lib/submission-types'

interface UpdateImageMetadataPayload {
  latitude: number | null
  longitude: number | null
  faceDirections: FaceDirection[]
  locationMode?: 'shared' | 'custom'
}

function normalizePayload(value: unknown): UpdateImageMetadataPayload | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    latitude?: unknown
    longitude?: unknown
    faceDirections?: unknown
    locationMode?: unknown
  }

  const latitude = candidate.latitude
  const longitude = candidate.longitude
  const faceDirections = candidate.faceDirections
  const locationMode = candidate.locationMode

  if (!(latitude === null || typeof latitude === 'number')) return null
  if (!(longitude === null || typeof longitude === 'number')) return null
  if (!Array.isArray(faceDirections)) return null
  if (!(locationMode === undefined || locationMode === 'shared' || locationMode === 'custom')) return null

  if (typeof latitude === 'number' && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return null
  if (typeof longitude === 'number' && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return null

  const normalizedDirections = Array.from(
    new Set(
      faceDirections
        .map((item) => (typeof item === 'string' ? item.toUpperCase() : ''))
        .filter((item): item is FaceDirection => FACE_DIRECTIONS.includes(item as FaceDirection))
    )
  )

  if (normalizedDirections.length !== faceDirections.length) {
    return null
  }

  return {
    latitude: latitude as number | null,
    longitude: longitude as number | null,
    faceDirections: normalizedDirections,
    locationMode: locationMode === 'shared' ? 'shared' : locationMode === 'custom' ? 'custom' : undefined,
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const supabase = getServerClientFromRequest(request)

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
    const payload = normalizePayload(body)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { data: result, error: rpcError } = await supabase.rpc('update_submission_image_metadata', {
      p_image_id: imageId,
      p_latitude: payload.latitude,
      p_longitude: payload.longitude,
      p_face_directions: payload.faceDirections,
      p_location_mode: payload.locationMode ?? null,
    })

    if (rpcError) {
      const message = (rpcError.message || '').toLowerCase()
      if (message.includes('permission')) {
        return NextResponse.json({ error: 'You do not have permission to edit this submission' }, { status: 403 })
      }
      if (message.includes('latitude') || message.includes('longitude') || message.includes('face direction')) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 })
      }
      return createErrorResponse(rpcError, 'Update submission image metadata error')
    }

    const { data: directLink } = await supabase
      .from('crag_images')
      .select('source_image_id')
      .eq('linked_image_id', imageId)
      .maybeSingle()

    const sourceImageId = typeof directLink?.source_image_id === 'string' && directLink.source_image_id
      ? directLink.source_image_id
      : imageId

    const relatedImageIds = new Set<string>([sourceImageId])
    const { data: linkedImages } = await supabase
      .from('crag_images')
      .select('linked_image_id')
      .eq('source_image_id', sourceImageId)

    for (const link of linkedImages || []) {
      if (typeof link.linked_image_id === 'string' && link.linked_image_id) {
        relatedImageIds.add(link.linked_image_id)
      }
    }

    if (payload.locationMode === 'shared' && relatedImageIds.size > 1) {
      const { error: syncCoordsError } = await supabase
        .from('images')
        .update({
          latitude: null,
          longitude: null,
          location_mode: 'shared',
          last_edited_by: userId,
        })
        .in('id', [...relatedImageIds])

      if (syncCoordsError) {
        console.error('Failed to sync linked image coordinates:', syncCoordsError)
      }
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
      metadata: result && typeof result === 'object' ? result : {
        latitude: payload.locationMode === 'shared' ? null : payload.latitude,
        longitude: payload.locationMode === 'shared' ? null : payload.longitude,
        location_mode: payload.locationMode ?? 'custom',
        face_directions: payload.faceDirections,
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Update submission image metadata error')
  }
}
