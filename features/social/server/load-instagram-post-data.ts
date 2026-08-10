import { parseRoutePoints } from '@/features/route-editor/public'
import { normalizePoints } from '@/lib/canvasMath'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { BROWSE_ROUTE_COLOR, SELECTED_ROUTE_COLOR } from '@/lib/route-renderer'
import { getImageByDisplayId, getRoutesByImage } from '@/features/image-first/public'
import type { RoutePoint } from '@/types/domain'

interface CragLocationRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
}

export interface InstagramPostData {
  imageUrl: string
  naturalWidth: number
  naturalHeight: number
  routes: Array<{
    routeId: string
    routePoints: RoutePoint[]
    strokeColor: string
    isSelected: boolean
  }>
}

function normalizeRoutePoints(points: RoutePoint[], width: number, height: number): RoutePoint[] {
  return normalizePoints(points, {
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
  })
}

function matchesRouteIdentifier(routeIdentifier: string, route: { id: string; climb_id: string; climbs: { slug: string | null } | Array<{ slug: string | null }> | null }) {
  const climb = Array.isArray(route.climbs) ? route.climbs[0] : route.climbs
  return route.id === routeIdentifier || route.climb_id === routeIdentifier || climb?.slug === routeIdentifier
}

export async function loadInstagramPostData(args: {
  country: string
  crag: string
  imageId: string
  routeIdentifier?: string | null
}): Promise<InstagramPostData | null> {
  const image = await getImageByDisplayId(args.imageId)
  if (!image) return null

  const routes = await getRoutesByImage(args.imageId)
  const selectedRoute = args.routeIdentifier
    ? routes.find((route) => matchesRouteIdentifier(args.routeIdentifier as string, route)) || null
    : null

  const normalizedRoutes = routes
    .map((route) => {
      const rawPoints = parseRoutePoints(route.points)
      const normalized = normalizeRoutePoints(rawPoints, image.width, image.height)
      if (normalized.length < 2) return null

      const isSelected = selectedRoute ? route.id === selectedRoute.id : false
      return {
        routeId: route.id,
        routePoints: normalized,
        strokeColor: isSelected ? SELECTED_ROUTE_COLOR : BROWSE_ROUTE_COLOR,
        isSelected,
      }
    })
    .filter((route): route is NonNullable<typeof route> => route !== null)

  const supabase = getUnauthenticatedClient()
  const { data: cragRow, error } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name')
    .eq('slug', args.crag)
    .eq('country_code', args.country.toUpperCase())
    .maybeSingle()

  if (error) throw error
  const crag = cragRow as CragLocationRow | null
  if (!crag) return null

  return {
    imageUrl: image.staticUrl,
    naturalWidth: image.width,
    naturalHeight: image.height,
    routes: normalizedRoutes,
  }
}
