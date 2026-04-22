import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchCragRoutePreviewsBatched } from '@/features/crags/lib/crag-route-targets'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const routeTargetsQuerySchema = z.object({
  cragId: z.string().uuid('cragId must be a valid uuid'),
})

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const url = new URL(request.url)
  const validation = parseWithSchema(routeTargetsQuerySchema, {
    cragId: url.searchParams.get('cragId'),
  })

  if (!validation.success) return validation.response

  // eslint-disable-next-line no-console
  console.log('CRAG_DEBUG', {
    stage: 'route_targets_api:start',
    cragId: validation.data.cragId,
  })

  const supabase = getAdminClientWithAudit('api/crags/route-targets')

  const targetMaps = await fetchCragRoutePreviewsBatched(supabase, validation.data.cragId, {}, { limit: undefined })

  // eslint-disable-next-line no-console
  console.log('CRAG_DEBUG', {
    stage: 'route_targets_api:return',
    cragId: validation.data.cragId,
    routeImageIdsCount: Object.keys(targetMaps.nextRouteImageIdsByClimbId).length,
    routePreviewCount: Object.keys(targetMaps.nextRoutePreviewByClimbId).length,
    routeNavigationTargetCount: Object.keys(targetMaps.nextRouteNavigationTargetByClimbId).length,
    defaultRouteTargetCount: Object.keys(targetMaps.nextDefaultRouteTargetByImageId).length,
    hasMore: false,
    durationMs: Date.now() - startedAt,
  })

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: false,
  })
}
