import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import {
  normalizeJsonRecord,
  resolveDraftImageReadinessStatus,
  type DraftImageRow,
  type DraftRouteRow,
} from '@/features/submissions/server/drafts/draft-route-shared'

type DraftImageReadinessStatus = 'processing' | 'ready' | 'error'

interface DraftImageResponse extends DraftImageRow {
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
      .select('id, user_id, crag_id, status, metadata, draft_kind, created_at, updated_at, last_edited_by, crags(name, latitude, longitude)')
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

    let topoReplacement: {
      id: string
      sourceImageId: string
      status: string
      reason: string
      routes: Array<{
        climbId: string
        name: string
        grade: string
        routeType: string | null
        description: string | null
        resolution: 'pending' | 'mapped' | 'not_visible'
        draftRouteId: string | null
      }>
    } | null = null
    if (draft.draft_kind === 'topo_replacement') {
      const { data: replacement, error: replacementError } = await supabase
        .from('topo_replacements')
        .select('id, source_image_id, status, reason')
        .eq('draft_id', id)
        .maybeSingle()
      if (replacementError || !replacement) {
        return createErrorResponse(replacementError || new Error('Topo replacement not found'), 'Failed to fetch topo replacement')
      }
      const { data: targets, error: targetsError } = await supabase
        .from('topo_replacement_routes')
        .select('climb_id, resolution, draft_route_id, climbs(id, name, grade, route_type, description)')
        .eq('replacement_id', replacement.id)
        .order('updated_at', { ascending: true })
      if (targetsError) return createErrorResponse(targetsError, 'Failed to fetch topo route mappings')

      topoReplacement = {
        id: replacement.id,
        sourceImageId: replacement.source_image_id,
        status: replacement.status,
        reason: replacement.reason,
        routes: (targets || []).map((target) => {
          const relation = Array.isArray(target.climbs) ? target.climbs[0] : target.climbs
          return {
            climbId: target.climb_id,
            name: relation?.name || 'Unnamed route',
            grade: relation?.grade || 'Unknown',
            routeType: relation?.route_type || null,
            description: relation?.description || null,
            resolution: target.resolution as 'pending' | 'mapped' | 'not_visible',
            draftRouteId: target.draft_route_id,
          }
        }),
      }
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
      const persistedRoutes = draftRoutesByImageId[image.id] || []
      return {
        ...image,
        route_data: {
          ...normalizedRouteData,
          completedRoutes: persistedRoutes,
        },
        preview_variants: normalizeJsonRecord(image.preview_variants),
        readiness_status: resolveDraftImageReadinessStatus(image),
      }
    })

    const isOwner = draft.user_id === userId
    return NextResponse.json({
      draft: {
        ...draft,
        metadata: normalizeJsonRecord(draft.metadata),
        images: withSignedUrls,
        topo_replacement: topoReplacement,
      },
      isOwner,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch submission draft')
  }
}
