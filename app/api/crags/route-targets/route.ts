import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { buildEffectiveClimbLookup, fetchCragRouteTargetPage } from '@/features/crags/lib/crag-route-targets'
import { CRAG_ROUTE_TARGETS_PAGE_SIZE } from '@/features/crags/lib/crag-route-target-page-size'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-route-targets'

export const runtime = 'nodejs'

const routeTargetsQuerySchema = z.object({
  cragId: z.string().uuid('cragId must be a valid uuid'),
  limit: z.coerce.number().int().min(1).max(100).default(CRAG_ROUTE_TARGETS_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validation = parseWithSchema(routeTargetsQuerySchema, {
    cragId: url.searchParams.get('cragId'),
    limit: url.searchParams.get('limit') || CRAG_ROUTE_TARGETS_PAGE_SIZE,
    offset: url.searchParams.get('offset') || 0,
  })

  if (!validation.success) return validation.response

  const supabase = getAdminClientWithAudit('api/crags/route-targets')
  const targetMaps = await fetchCragRouteTargetPage(supabase, validation.data.cragId, validation.data.limit, validation.data.offset)

  const climbIds = Object.keys(targetMaps.nextRoutePreviewByClimbId)
  let effectiveClimbIdByClimbId: Record<string, string> = {}

  if (climbIds.length > 0) {
    const { data } = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)

    if (data && data.length > 0) {
      const lookup = buildEffectiveClimbLookup(data as ClimbIdentityRow[])
      effectiveClimbIdByClimbId = lookup.effectiveClimbIdByClimbId
    }
  }

  const actualToEffective = Object.fromEntries(
    Object.entries(effectiveClimbIdByClimbId).filter(([k, v]) => k !== v)
  )

  const remappedTargetMaps = {
    nextRoutePreviewByClimbId: { ...targetMaps.nextRoutePreviewByClimbId },
    nextRouteNavigationTargetByClimbId: { ...targetMaps.nextRouteNavigationTargetByClimbId },
    nextRouteImageIdsByClimbId: { ...targetMaps.nextRouteImageIdsByClimbId },
  }

  for (const [actualId, effectiveId] of Object.entries(actualToEffective)) {
    if (remappedTargetMaps.nextRoutePreviewByClimbId[effectiveId] && !remappedTargetMaps.nextRoutePreviewByClimbId[actualId]) {
      remappedTargetMaps.nextRoutePreviewByClimbId[actualId] = remappedTargetMaps.nextRoutePreviewByClimbId[effectiveId]
    }
    if (remappedTargetMaps.nextRouteNavigationTargetByClimbId[effectiveId] && !remappedTargetMaps.nextRouteNavigationTargetByClimbId[actualId]) {
      remappedTargetMaps.nextRouteNavigationTargetByClimbId[actualId] = remappedTargetMaps.nextRouteNavigationTargetByClimbId[effectiveId]
    }
    if (remappedTargetMaps.nextRouteImageIdsByClimbId[effectiveId] && !remappedTargetMaps.nextRouteImageIdsByClimbId[actualId]) {
      remappedTargetMaps.nextRouteImageIdsByClimbId[actualId] = remappedTargetMaps.nextRouteImageIdsByClimbId[effectiveId]
    }
  }

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: remappedTargetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: remappedTargetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: remappedTargetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: Object.keys(targetMaps.nextRoutePreviewByClimbId).length === validation.data.limit,
  })
}
