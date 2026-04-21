import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchCragRouteTargetPage } from '@/features/crags/lib/crag-route-targets'
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

  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined
  const offsetParam = url.searchParams.get('offset')
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0
  const targetMaps = await fetchCragRouteTargetPage(supabase, validation.data.cragId, limit ?? 50, offset)

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: false,
  })
}
