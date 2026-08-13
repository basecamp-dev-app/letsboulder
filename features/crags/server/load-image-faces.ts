import { NextResponse } from 'next/server'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { createSignedObjectUrls } from '@/lib/media/object-urls'
import { reportError } from '@/lib/errors'
import type { Json } from '@/types/database'

type SupabaseClient = ReturnType<typeof getUnauthenticatedClient>

interface FaceItem {
  id: string
  image_id?: string | null
  index?: number
  is_primary: boolean
  url: string | null
  has_routes: boolean
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata?: {
    width: number | null
    height: number | null
  }
  routes?: CompleteSummaryRoute[]
}

interface PrimaryImageRow {
  id: string
  url: string
  crag_id: string | null
  face_directions?: string[] | null
}

interface RelatedFaceRow {
  id: string
  url: string
  source_image_id: string | null
  linked_image_id: string | null
  width: number | null
  height: number | null
  face_directions?: string[] | null
  legacy_published_at: string | null
  linked_image: {
    processing_status: string
    moderation_status: string | null
    visibility: string
    status: string
    url: string
  } | Array<{
    processing_status: string
    moderation_status: string | null
    visibility: string
    status: string
    url: string
  }> | null
}

interface CanonicalFaceLinkRow {
  source_image_id: string | null
}

interface CompleteSummaryRoute {
  id: string
  climb_id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
}

interface CompleteSummaryFace {
  image_id: string | null
  index: number
  is_primary: boolean
  url: string | null
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata: {
    width: number | null
    height: number | null
  } | null
  routes: CompleteSummaryRoute[]
  has_routes: boolean
}

interface CompleteSummaryPayload {
  crag_id: string | null
  primary_image_id: string
  faces: CompleteSummaryFace[]
  summary: {
    total_faces: number
    total_routes: number
  }
}

function isJsonObject(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: Json | undefined): value is string | null {
  return value === null || typeof value === 'string'
}

function isCompleteSummaryRoute(value: Json): value is CompleteSummaryRoute & { [key: string]: Json | undefined } {
  if (!isJsonObject(value)) return false
  return typeof value.id === 'string'
    && typeof value.climb_id === 'string'
    && typeof value.name === 'string'
    && typeof value.grade === 'string'
    && isNullableString(value.route_type)
    && isNullableString(value.description)
    && isNullableString(value.color)
    && Array.isArray(value.points)
    && (value.image_width === null || typeof value.image_width === 'number')
    && (value.image_height === null || typeof value.image_height === 'number')
    && (value.sequence_order === null || typeof value.sequence_order === 'number')
}

function isCompleteSummaryFace(value: Json): value is CompleteSummaryFace & { [key: string]: Json | undefined } {
  if (!isJsonObject(value)) return false
  const metadata = value.metadata
  const directions = value.face_directions
  return isNullableString(value.image_id)
    && typeof value.index === 'number'
    && typeof value.is_primary === 'boolean'
    && isNullableString(value.url)
    && isNullableString(value.linked_image_id)
    && isNullableString(value.crag_image_id)
    && (directions === null || (Array.isArray(directions) && directions.every((item) => typeof item === 'string')))
    && (metadata === null || (isJsonObject(metadata)
      && (metadata.width === null || typeof metadata.width === 'number')
      && (metadata.height === null || typeof metadata.height === 'number')))
    && Array.isArray(value.routes)
    && value.routes.every(isCompleteSummaryRoute)
    && typeof value.has_routes === 'boolean'
}

function isCompleteSummaryPayload(value: Json | null): value is CompleteSummaryPayload & { [key: string]: Json | undefined } {
  if (!isJsonObject(value) || !Array.isArray(value.faces) || !isJsonObject(value.summary)) return false
  return isNullableString(value.crag_id)
    && typeof value.primary_image_id === 'string'
    && value.faces.every(isCompleteSummaryFace)
    && typeof value.summary.total_faces === 'number'
    && typeof value.summary.total_routes === 'number'
}

interface RouteLineRaw {
  id: string
  image_id: string
  climb_id: string
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  created_at: string
  climbs:
    | { id: string; name: string; grade: string; route_type: string | null; description: string | null }
    | Array<{ id: string; name: string; grade: string; route_type: string | null; description: string | null }>
    | null
}

function pickClimb(value: RouteLineRaw['climbs']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

async function fetchRoutesByImageIds(supabase: SupabaseClient, imageIds: string[]): Promise<Map<string, CompleteSummaryRoute[]>> {
  const map = new Map<string, CompleteSummaryRoute[]>()
  if (imageIds.length === 0) return map

  const uniqueIds = Array.from(new Set(imageIds.filter((id) => !!id)))
  if (uniqueIds.length === 0) return map

  const { data, error } = await supabase
    .from('route_lines')
    .select(`
      id,
      image_id,
      climb_id,
      color,
      points,
      image_width,
      image_height,
      sequence_order,
      created_at,
      climbs (id, name, grade, route_type, description)
    `)
    .in('image_id', uniqueIds)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    reportError(error, { message: 'Faces fallback route query failed', level: 'warning' })
    return map
  }

  for (const row of (data || []) as RouteLineRaw[]) {
    const climb = pickClimb(row.climbs)
    if (!row.image_id || !climb) continue

    const route: CompleteSummaryRoute = {
      id: row.id,
      climb_id: row.climb_id,
      name: climb.name,
      grade: climb.grade,
      route_type: climb.route_type,
      description: climb.description,
      color: row.color,
      points: row.points,
      image_width: row.image_width,
      image_height: row.image_height,
      sequence_order: row.sequence_order,
    }

    const existing = map.get(row.image_id) || []
    existing.push(route)
    map.set(row.image_id, existing)
  }

  return map
}

function isMissingFaceDirectionsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; message?: string; details?: string }
  const message = `${candidate.message || ''} ${candidate.details || ''}`.toLowerCase()
  return candidate.code === '42703' && message.includes('face_directions')
}

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

function isPubliclyDeliverableLinkedFace(face: RelatedFaceRow): boolean {
  if (!face.linked_image_id) return face.legacy_published_at !== null
  const linkedImage = Array.isArray(face.linked_image) ? face.linked_image[0] : face.linked_image
  return linkedImage?.processing_status === 'ready'
    && (linkedImage.moderation_status === 'approved' || linkedImage.moderation_status === 'skipped')
    && linkedImage.visibility === 'public'
    && linkedImage.status === 'approved'
}

function resolveRelatedFaceUrl(face: RelatedFaceRow): string {
  const linkedImage = Array.isArray(face.linked_image) ? face.linked_image[0] : face.linked_image
  return linkedImage?.url || face.url
}

async function toViewableUrlMap(rawUrls: string[], signer: SupabaseClient): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const groupedPaths = new Map<string, Set<string>>()

  for (const rawUrl of rawUrls) {
    if (!rawUrl) continue
    const parsed = parsePrivateStorageUrl(rawUrl)
    if (!parsed) {
      map.set(rawUrl, rawUrl)
      continue
    }

    const bucketPaths = groupedPaths.get(parsed.bucket) || new Set<string>()
    bucketPaths.add(parsed.path)
    groupedPaths.set(parsed.bucket, bucketPaths)
  }

  for (const [bucket, pathSet] of groupedPaths.entries()) {
    const paths = Array.from(pathSet)
    if (paths.length === 0) continue

    try {
      const signed = await createSignedObjectUrls(paths.map((path) => ({ bucket, path })), signer)
      for (const path of paths) {
        map.set(`private://${bucket}/${path}`, signed.get(`${bucket}:${path}`) ?? null)
      }
    } catch {
      for (const path of paths) {
        map.set(`private://${bucket}/${path}`, null)
      }
    }
  }

  return map
}

async function fetchPrimaryImage(supabase: SupabaseClient, imageId: string): Promise<{ data: PrimaryImageRow | null; error: unknown }> {
  const withDirections = await supabase
    .from('images')
    .select('id, url, crag_id, face_directions')
    .eq('id', imageId)
    .maybeSingle()

  if (!withDirections.error) {
    return { data: (withDirections.data as PrimaryImageRow | null) ?? null, error: null }
  }

  if (!isMissingFaceDirectionsColumn(withDirections.error)) {
    return { data: null, error: withDirections.error }
  }

  const fallback = await supabase
    .from('images')
    .select('id, url, crag_id')
    .eq('id', imageId)
    .maybeSingle()

  if (fallback.error) return { data: null, error: fallback.error }
  if (!fallback.data) return { data: null, error: null }

  return {
    data: {
      ...(fallback.data as Omit<PrimaryImageRow, 'face_directions'>),
      face_directions: null,
    },
    error: null,
  }
}

async function fetchRelatedFaces(supabase: SupabaseClient, cragId: string, primaryImageId: string): Promise<{ data: RelatedFaceRow[]; error: unknown }> {
  const filter = `source_image_id.eq.${primaryImageId},and(source_image_id.is.null,linked_image_id.eq.${primaryImageId})`

  const withDirections = await supabase
    .from('crag_images')
    .select('id, url, source_image_id, linked_image_id, width, height, face_directions, legacy_published_at, linked_image:linked_image_id(processing_status, moderation_status, visibility, status, url)')
    .eq('crag_id', cragId)
    .or(filter)
    .order('created_at', { ascending: true })

  if (!withDirections.error) {
    return { data: (withDirections.data || []) as RelatedFaceRow[], error: null }
  }

  if (!isMissingFaceDirectionsColumn(withDirections.error)) {
    return { data: [], error: withDirections.error }
  }

  const fallback = await supabase
    .from('crag_images')
    .select('id, url, source_image_id, linked_image_id, width, height, legacy_published_at, linked_image:linked_image_id(processing_status, moderation_status, visibility, status, url)')
    .eq('crag_id', cragId)
    .or(filter)
    .order('created_at', { ascending: true })

  if (fallback.error) return { data: [], error: fallback.error }

  return {
    data: ((fallback.data || []) as Array<Omit<RelatedFaceRow, 'face_directions'>>).map((face) => ({
      ...face,
      face_directions: null,
    })),
    error: null,
  }
}

async function resolveCanonicalFaceImageId(supabase: SupabaseClient, imageId: string): Promise<string> {
  const { data, error } = await supabase
    .from('crag_images')
    .select('source_image_id')
    .eq('linked_image_id', imageId)
    .not('source_image_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    reportError(error, { message: 'Faces canonical image lookup failed', level: 'warning' })
    return imageId
  }

  const canonicalLink = data as CanonicalFaceLinkRow | null
  return canonicalLink?.source_image_id || imageId
}

export async function loadImageFaces(requestedImageId: string) {
  const supabase = getUnauthenticatedClient()
  const signingClient = getAdminClientWithAudit('load image faces for signing')

  try {
    const imageId = await resolveCanonicalFaceImageId(supabase, requestedImageId)
    const { data: completeSummaryData, error: completeSummaryError } = await supabase.rpc('get_crag_faces_complete_summary', {
      p_image_id: imageId,
    })

    if (!completeSummaryError && isCompleteSummaryPayload(completeSummaryData)) {
      const completeSummary = completeSummaryData
      const rawFaces = Array.isArray(completeSummary.faces) ? completeSummary.faces : []
      const allFaceUrls = rawFaces
        .map((face) => face.url)
        .filter((url): url is string => typeof url === 'string' && !!url)

      const signedUrlMap = await toViewableUrlMap(allFaceUrls, signingClient)
      const faces = rawFaces
        .map((face) => {
          if (!face.url) return null
          const signedUrl = signedUrlMap.get(face.url) ?? null
          if (!signedUrl) return null

          const linkedImageId = face.linked_image_id === completeSummary.primary_image_id ? null : face.linked_image_id
          const resolvedImageId = face.image_id || linkedImageId || (face.is_primary ? completeSummary.primary_image_id : null)

          return {
            id: face.is_primary ? `image:${completeSummary.primary_image_id}` : `crag-image:${face.crag_image_id || face.index}`,
            index: face.index,
            image_id: resolvedImageId,
            is_primary: face.is_primary,
            url: signedUrl,
            has_routes: face.has_routes || (Array.isArray(face.routes) && face.routes.length > 0),
            linked_image_id: linkedImageId,
            crag_image_id: face.crag_image_id,
            face_directions: Array.isArray(face.face_directions) ? face.face_directions : null,
            metadata: face.metadata || { width: null, height: null },
            routes: Array.isArray(face.routes) ? face.routes : [],
          }
        })
        .filter((face): face is NonNullable<typeof face> => face !== null)

      const totalFaces = typeof completeSummary.summary?.total_faces === 'number' ? completeSummary.summary.total_faces : faces.length
      const totalRoutes = typeof completeSummary.summary?.total_routes === 'number'
        ? completeSummary.summary.total_routes
        : faces.reduce((sum, face) => sum + face.routes.length, 0)

      return NextResponse.json({
        crag_id: completeSummary.crag_id || null,
        primary_image_id: completeSummary.primary_image_id,
        faces,
        summary: {
          total_faces: totalFaces,
          total_routes: totalRoutes,
        },
        total_faces: totalFaces,
        total_routes_combined: totalRoutes,
      })
    }

    reportError(completeSummaryError, {
      message: 'Faces complete summary RPC unavailable, using fallback path',
      level: 'warning',
      extra: {
        imageId,
        requestedImageId,
      },
    })

    const { data: primaryImage, error: primaryError } = await fetchPrimaryImage(supabase, imageId)
    if (primaryError) {
      reportError(primaryError, { message: 'Faces primary image query failed' })
      return NextResponse.json({ error: 'Failed to fetch image faces' }, { status: 500 })
    }

    if (!primaryImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!primaryImage.crag_id) {
      const signedUrlMap = await toViewableUrlMap([primaryImage.url], signingClient)
      const primaryUrl = signedUrlMap.get(primaryImage.url) ?? null
      const { data: summaryData } = await supabase.rpc('get_image_faces_summary', { p_image_id: imageId })
      const summary = summaryData?.[0] ?? null

      return NextResponse.json({
        faces: primaryUrl ? [{
          id: `image:${primaryImage.id}`,
          is_primary: true,
          url: primaryUrl,
          has_routes: true,
          linked_image_id: primaryImage.id,
          crag_image_id: null,
          face_directions: primaryImage.face_directions ?? null,
        } satisfies FaceItem] : [],
        total_faces: summary?.total_faces ?? 1,
        total_routes_combined: summary?.total_routes_combined ?? 0,
      })
    }

    const { data: relatedFaces, error: relatedError } = await fetchRelatedFaces(supabase, primaryImage.crag_id, primaryImage.id)
    if (relatedError) {
      reportError(relatedError, { message: 'Faces related images query failed' })
      return NextResponse.json({ error: 'Failed to fetch related faces' }, { status: 500 })
    }

    const eligibleRelatedFaces = relatedFaces.filter(isPubliclyDeliverableLinkedFace)
    const linkedIds = eligibleRelatedFaces
      .map((face) => face.linked_image_id)
      .filter((id): id is string => typeof id === 'string' && !!id)

    const routeMap = await fetchRoutesByImageIds(supabase, [primaryImage.id, ...linkedIds])
    const allFaceUrls = [primaryImage.url, ...eligibleRelatedFaces.map(resolveRelatedFaceUrl)]
    const signedUrlMap = await toViewableUrlMap(allFaceUrls, signingClient)
    const primaryUrl = signedUrlMap.get(primaryImage.url) ?? null

    const faces: FaceItem[] = []
    if (primaryUrl) {
      const primaryRoutes = routeMap.get(primaryImage.id) || []
      faces.push({
        id: `image:${primaryImage.id}`,
        image_id: primaryImage.id,
        index: 0,
        is_primary: true,
        url: primaryUrl,
        has_routes: primaryRoutes.length > 0,
        linked_image_id: primaryImage.id,
        crag_image_id: null,
        face_directions: primaryImage.face_directions ?? null,
        metadata: { width: null, height: null },
        routes: primaryRoutes,
      })
    }

    const signedFaceCandidates = eligibleRelatedFaces.map((face, index) => {
      const signedUrl = signedUrlMap.get(resolveRelatedFaceUrl(face)) ?? null
      if (!signedUrl) return null

      const resolvedLinkedImageId = face.linked_image_id === primaryImage.id ? null : face.linked_image_id
      const resolvedImageId = resolvedLinkedImageId
      const faceRoutes = resolvedImageId ? routeMap.get(resolvedImageId) || [] : []
      return {
        id: `crag-image:${face.id}`,
        image_id: resolvedImageId,
        index: index + 1,
        is_primary: false,
        url: signedUrl,
        has_routes: faceRoutes.length > 0,
        linked_image_id: resolvedLinkedImageId,
        crag_image_id: face.id,
        face_directions: face.face_directions ?? null,
        metadata: {
          width: face.width ?? null,
          height: face.height ?? null,
        },
        routes: faceRoutes,
      } as FaceItem
    })

    const seenCragImageIds = new Set<string>()
    const seenFaceKeys = new Set<string>()
    for (const face of signedFaceCandidates) {
      if (!face || !face.crag_image_id) continue
      if (seenCragImageIds.has(face.crag_image_id)) continue

      const faceKey = face.linked_image_id ? `linked:${face.linked_image_id}` : `url:${face.url}`
      if (seenFaceKeys.has(faceKey)) continue

      seenCragImageIds.add(face.crag_image_id)
      seenFaceKeys.add(faceKey)
      faces.push(face)
    }

    const { data: summaryData } = await supabase.rpc('get_image_faces_summary', { p_image_id: imageId })
    const summary = summaryData?.[0] ?? null

    return NextResponse.json({
      faces,
      total_faces: summary?.total_faces ?? Math.max(1, faces.length),
      total_routes_combined: summary?.total_routes_combined ?? 0,
    })
  } catch (error) {
    reportError(error, { message: 'Failed to fetch image faces' })
    return NextResponse.json({ error: 'Failed to fetch image faces' }, { status: 500 })
  }
}
