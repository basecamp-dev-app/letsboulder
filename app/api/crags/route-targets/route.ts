import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { buildEffectiveClimbLookup, fetchAllCragRoutePreviews } from '@/features/crags/lib/crag-route-targets'

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

  const { data: climbData } = await supabase
    .from('climbs')
    .select('id, shared_climb_id')
    .eq('crag_id', validation.data.cragId)
    .is('deleted_at', null)

  const effectiveClimbIdByClimbId: Record<string, string> = {}
  if (climbData && climbData.length > 0) {
    const lookup = buildEffectiveClimbLookup(climbData as Array<{ id: string; shared_climb_id: string | null }>)
    Object.assign(effectiveClimbIdByClimbId, lookup.effectiveClimbIdByClimbId)
  }

  const targetMaps = await fetchAllCragRoutePreviews(supabase, validation.data.cragId, effectiveClimbIdByClimbId)

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
    hasMore: false,
  })
}
