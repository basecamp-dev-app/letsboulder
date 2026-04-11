import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { fetchRouteTargetMapsForClimbIds } from '@/features/crags/lib/crag-route-targets'

export const runtime = 'nodejs'

const CRAG_DEBUG_ROUTE_IDS = new Set([
  '8f450e11-55f7-40dd-b04b-e48d0061fd7b',
  '84d00fe1-44a6-48b5-b7e2-ef3205957df1',
  'e03dde44-6aef-454a-b4b1-e8237c040407',
  '1969f064-41d8-4150-b469-d09cbea993bc',
])

const routeTargetsQuerySchema = z.object({
  climbIds: z.string().min(1, 'climbIds is required'),
})

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validation = parseWithSchema(routeTargetsQuerySchema, {
    climbIds: url.searchParams.get('climbIds'),
  })

  if (!validation.success) return validation.response

  const climbIds = Array.from(new Set(
    validation.data.climbIds.split(',').map((value) => value.trim()).filter(Boolean)
  ))

  if (climbIds.length === 0) {
    return NextResponse.json({
      defaultRouteTargetByImageId: {},
      routeImageIdsByClimbId: {},
      routePreviewByClimbId: {},
      routeNavigationTargetByClimbId: {},
    })
  }

  const supabase = getAdminClientWithAudit('api/crags/route-targets')
  const { targetMaps } = await fetchRouteTargetMapsForClimbIds(supabase, climbIds, new Map())

  console.log('[Crag Route Targets API Debug]', {
    requestedClimbIds: climbIds.length,
    returnedRouteImageKeys: Object.keys(targetMaps.nextRouteImageIdsByClimbId).length,
    returnedPreviewKeys: Object.keys(targetMaps.nextRoutePreviewByClimbId).length,
    returnedNavigationKeys: Object.keys(targetMaps.nextRouteNavigationTargetByClimbId).length,
    debugRoutes: climbIds.filter((climbId) => CRAG_DEBUG_ROUTE_IDS.has(climbId)).map((climbId) => ({
      climbId,
      routeImageIds: targetMaps.nextRouteImageIdsByClimbId[climbId] || [],
      preview: targetMaps.nextRoutePreviewByClimbId[climbId] || null,
      navigationTarget: targetMaps.nextRouteNavigationTargetByClimbId[climbId] || null,
    })),
  })

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
  })
}
