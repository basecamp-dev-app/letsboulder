import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { fetchRouteTargetMapsForClimbIds } from '@/features/crags/lib/crag-route-targets'

export const runtime = 'nodejs'

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

  return NextResponse.json({
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
  })
}
