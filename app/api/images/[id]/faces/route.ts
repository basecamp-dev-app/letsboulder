import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface FaceItem {
  id: string
  is_primary: boolean
  url: string | null
  has_routes: boolean
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
}

interface FacesSummaryRow {
  total_faces: number
  total_routes_combined: number
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
  face_directions?: string[] | null
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

async function toViewableUrlMap(
  rawUrls: string[],
  signer: ReturnType<typeof createServerClient>
): Promise<Map<string, string | null>> {
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

    const { data, error } = await signer.storage.from(bucket).createSignedUrls(paths, 3600)
    if (error) {
      for (const path of paths) {
        map.set(`private://${bucket}/${path}`, null)
      }
      continue
    }

    const signedByPath = new Map<string, string>()
    for (const item of data || []) {
      if (!item?.path || !item?.signedUrl) continue
      signedByPath.set(item.path, item.signedUrl)
    }

    for (const path of paths) {
      map.set(`private://${bucket}/${path}`, signedByPath.get(path) ?? null)
    }
  }

  return map
}

async function fetchPrimaryImage(
  supabase: ReturnType<typeof createServerClient>,
  imageId: string
): Promise<{ data: PrimaryImageRow | null; error: unknown }> {
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

async function fetchRelatedFaces(
  supabase: ReturnType<typeof createServerClient>,
  cragId: string,
  primaryImageId: string
): Promise<{ data: RelatedFaceRow[]; error: unknown }> {
  const filter = `source_image_id.eq.${primaryImageId},and(source_image_id.is.null,linked_image_id.eq.${primaryImageId})`

  const withDirections = await supabase
    .from('crag_images')
    .select('id, url, source_image_id, linked_image_id, face_directions')
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
    .select('id, url, source_image_id, linked_image_id')
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: imageId } = await params
  if (!imageId) {
    return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const signingClient = serviceRoleKey
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { cookies: { getAll() { return [] }, setAll() {} } }
      )
    : supabase

  try {
    const { data: completeSummaryData, error: completeSummaryError } = await supabase.rpc('get_crag_faces_complete_summary', {
      p_image_id: imageId,
    })

    if (!completeSummaryError && completeSummaryData) {
      const completeSummary = completeSummaryData as CompleteSummaryPayload
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
            id: face.is_primary
              ? `image:${completeSummary.primary_image_id}`
              : `crag-image:${face.crag_image_id || face.index}`,
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
        .filter((face): face is {
          id: string
          index: number
          image_id: string | null
          is_primary: boolean
          url: string
          has_routes: boolean
          linked_image_id: string | null
          crag_image_id: string | null
          face_directions: string[] | null
          metadata: { width: number | null; height: number | null }
          routes: CompleteSummaryRoute[]
        } => face !== null)

      const totalFaces = typeof completeSummary.summary?.total_faces === 'number'
        ? completeSummary.summary.total_faces
        : faces.length
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

    const { data: primaryImage, error: primaryError } = await fetchPrimaryImage(supabase, imageId)

    if (primaryError) {
      console.error('Faces primary image query failed:', primaryError)
      return NextResponse.json({ error: 'Failed to fetch image faces' }, { status: 500 })
    }

    if (!primaryImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (!primaryImage.crag_id) {
      const signedUrlMap = await toViewableUrlMap([primaryImage.url], signingClient)
      const primaryUrl = signedUrlMap.get(primaryImage.url) ?? null

      const { data: summaryData } = await supabase.rpc('get_image_faces_summary', {
        p_image_id: imageId,
      })
      const summary = (Array.isArray(summaryData) ? summaryData[0] : summaryData) as FacesSummaryRow | null

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

    const { data: relatedFaces, error: relatedError } = await fetchRelatedFaces(
      supabase,
      primaryImage.crag_id,
      primaryImage.id
    )

    if (relatedError) {
      console.error('Faces related images query failed:', relatedError)
      return NextResponse.json({ error: 'Failed to fetch related faces' }, { status: 500 })
    }

    const linkedIds = (relatedFaces || [])
      .map((face) => face.linked_image_id)
      .filter((id): id is string => typeof id === 'string' && !!id)

    const routeCountsByImageId = new Set<string>()
    if (linkedIds.length > 0) {
      const { data: routeLines } = await supabase
        .from('route_lines')
        .select('image_id')
        .in('image_id', linkedIds)

      for (const row of routeLines || []) {
        if (row.image_id) routeCountsByImageId.add(row.image_id)
      }
    }

    const allFaceUrls = [primaryImage.url, ...(relatedFaces || []).map((face) => face.url)]
    const signedUrlMap = await toViewableUrlMap(allFaceUrls, signingClient)
    const primaryUrl = signedUrlMap.get(primaryImage.url) ?? null

    const faces: FaceItem[] = []
    if (primaryUrl) {
      faces.push({
        id: `image:${primaryImage.id}`,
        is_primary: true,
        url: primaryUrl,
        has_routes: true,
        linked_image_id: primaryImage.id,
        crag_image_id: null,
        face_directions: primaryImage.face_directions ?? null,
      })
    }

    const signedFaceCandidates = (relatedFaces || []).map((face) => {
      const signedUrl = signedUrlMap.get(face.url) ?? null
      if (!signedUrl) return null

      const resolvedLinkedImageId = face.linked_image_id === primaryImage.id ? null : face.linked_image_id
      return {
        id: `crag-image:${face.id}`,
        is_primary: false,
        url: signedUrl,
        has_routes: !!(resolvedLinkedImageId && routeCountsByImageId.has(resolvedLinkedImageId)),
        linked_image_id: resolvedLinkedImageId,
        crag_image_id: face.id,
        face_directions: face.face_directions ?? null,
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

    const { data: summaryData } = await supabase.rpc('get_image_faces_summary', {
      p_image_id: imageId,
    })

    const summary = (Array.isArray(summaryData) ? summaryData[0] : summaryData) as FacesSummaryRow | null

    return NextResponse.json({
      faces,
      total_faces: summary?.total_faces ?? Math.max(1, faces.length),
      total_routes_combined: summary?.total_routes_combined ?? 0,
    })
  } catch (error) {
    console.error('Failed to fetch image faces:', error)
    return NextResponse.json({ error: 'Failed to fetch image faces' }, { status: 500 })
  }
}
