import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { fetchCragRouteTargetPage } from '@/features/crags/lib/crag-route-targets'
import { CRAG_ROUTE_TARGETS_PAGE_SIZE } from '@/features/crags/lib/crag-route-target-page-size'

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

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: Object.keys(targetMaps.nextRoutePreviewByClimbId).length === validation.data.limit,
  })
}
