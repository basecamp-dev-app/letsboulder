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
  const url = new URL(request.url)
  const validation = parseWithSchema(routeTargetsQuerySchema, {
    cragId: url.searchParams.get('cragId'),
  })

  if (!validation.success) return validation.response

  const supabase = getAdminClientWithAudit('api/crags/route-targets')

  const targetMaps = await fetchCragRoutePreviewsBatched(supabase, validation.data.cragId, {}, { limit: undefined })

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: false,
  })
}
