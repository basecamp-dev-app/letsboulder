import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface FaceItem {
  id: string
  is_primary: boolean
  url: string | null
  has_routes: boolean
  linked_image_id: string | null
  crag_image_id: string | null
}

interface FacesSummaryRow {
  total_faces: number
  total_routes_combined: number
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

async function toViewableUrl(
  rawUrl: string,
  signer: ReturnType<typeof createServerClient>
): Promise<string | null> {
  const parsed = parsePrivateStorageUrl(rawUrl)
  if (!parsed) return rawUrl

  const { data, error } = await signer.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
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
    const { data: primaryImage, error: primaryError } = await supabase
      .from('images')
      .select('id, url, crag_id')
      .eq('id', imageId)
      .maybeSingle()

    if (primaryError || !primaryImage) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const primaryUrl = await toViewableUrl(primaryImage.url, signingClient)

    if (!primaryImage.crag_id) {
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
      } satisfies FaceItem] : [],
        total_faces: summary?.total_faces ?? 1,
        total_routes_combined: summary?.total_routes_combined ?? 0,
      })
    }

    const { data: relatedFaces, error: relatedError } = await supabase
      .from('crag_images')
      .select('id, url, source_image_id, linked_image_id')
      .eq('crag_id', primaryImage.crag_id)
      .or(`source_image_id.eq.${primaryImage.id},and(source_image_id.is.null,linked_image_id.eq.${primaryImage.id})`)
      .order('created_at', { ascending: true })

    if (relatedError) {
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

    const faces: FaceItem[] = []
    if (primaryUrl) {
      faces.push({
        id: `image:${primaryImage.id}`,
        is_primary: true,
        url: primaryUrl,
        has_routes: true,
        linked_image_id: primaryImage.id,
        crag_image_id: null,
      })
    }

    const signedFaceCandidates = await Promise.all(
      (relatedFaces || []).map(async (face) => {
        const signedUrl = await toViewableUrl(face.url, signingClient)
        if (!signedUrl) return null
        const resolvedLinkedImageId = face.linked_image_id === primaryImage.id ? null : face.linked_image_id
        return {
          id: `crag-image:${face.id}`,
          is_primary: false,
          url: signedUrl,
          has_routes: !!(resolvedLinkedImageId && routeCountsByImageId.has(resolvedLinkedImageId)),
          linked_image_id: resolvedLinkedImageId,
          crag_image_id: face.id,
        } as FaceItem
      })
    )

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
