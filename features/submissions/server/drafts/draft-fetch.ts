import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import type { Database } from '@/types/database'
import {
  buildDraftImageProxyUrl,
  normalizeJsonRecord,
  resolveDraftImageReadinessStatus,
  type DraftImageRow,
  type DraftRouteRow,
} from '@/features/submissions/server/drafts/draft-route-shared'

type DraftImageReadinessStatus = 'processing' | 'ready' | 'error'

interface DraftImageResponse extends DraftImageRow {
  proxy_url: string | null
  readiness_status: DraftImageReadinessStatus
}

export async function fetchDraft(id: string, request: NextRequest) {
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
    if (authError || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, crag_id, status, metadata, created_at, updated_at, last_edited_by, crags(name, latitude, longitude)')
      .eq('id', id)
      .maybeSingle()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const { data: images, error: imagesError } = await supabase
      .from('submission_draft_images')
      .select('id, draft_id, display_order, storage_bucket, storage_path, width, height, route_data, latitude, longitude, created_at, updated_at, processing_status, preview_variants')
      .eq('draft_id', id)
      .order('display_order', { ascending: true })

    if (imagesError) {
      return createErrorResponse(imagesError, 'Failed to fetch draft images')
    }

    const imageRows = (images || []) as DraftImageRow[]
    const { data: draftRoutes, error: draftRoutesError } = await supabase
      .from('submission_draft_routes')
      .select('id, draft_image_id, name, grade, description, climb_type, points, sequence_order, image_width, image_height, created_at, updated_at')
      .eq('draft_id', id)
      .order('draft_image_id', { ascending: true })
      .order('sequence_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (draftRoutesError) {
      return createErrorResponse(draftRoutesError, 'Failed to fetch draft routes')
    }

    const draftRoutesByImageId = ((draftRoutes || []) as DraftRouteRow[]).reduce<Record<string, Array<Record<string, unknown>>>>((acc, route) => {
      const points = Array.isArray(route.points) ? route.points : []
      const imageRoutes = acc[route.draft_image_id] || []
      imageRoutes.push({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climb_type,
        points,
        sequenceOrder: route.sequence_order,
        imageWidth: route.image_width,
        imageHeight: route.image_height,
      })
      acc[route.draft_image_id] = imageRoutes
      return acc
    }, {})

    const withSignedUrls: DraftImageResponse[] = imageRows.map((image) => {
      const normalizedRouteData = normalizeJsonRecord(image.route_data) ?? {}
      const persistedRoutes = draftRoutesByImageId[image.id]
      return {
        ...image,
        route_data: persistedRoutes
          ? {
              ...normalizedRouteData,
              completedRoutes: persistedRoutes,
            }
          : normalizedRouteData,
        preview_variants: normalizeJsonRecord(image.preview_variants),
        proxy_url: image.storage_path ? buildDraftImageProxyUrl(id, image.storage_path) : null,
        readiness_status: resolveDraftImageReadinessStatus(image),
      }
    })

    const isOwner = draft.user_id === userId
    return NextResponse.json({ draft: { ...draft, metadata: normalizeJsonRecord(draft.metadata), images: withSignedUrls }, isOwner })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch submission draft')
  }
}
