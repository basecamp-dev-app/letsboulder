import { notFound, permanentRedirect } from 'next/navigation'
import type { ImageData } from '@/features/crags/lib/crag-page-types'
import { fetchRouteTargetMapsForClimbIds } from '@/features/crags/lib/crag-route-targets'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'

async function getCanonicalClimbRedirect(id: string) {
  const supabase = getUnauthenticatedClient()
  const { data: climb, error: climbError } = await supabase
    .from('climbs')
    .select('id, crag_id, crags(country_code, slug)')
    .eq('id', id)
    .maybeSingle()

  if (climbError) {
    throw climbError
  }

  const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags
  if (!climb?.crag_id || !crag?.country_code || !crag?.slug) {
    return null
  }

  const { data: imageRows, error: imageError } = await supabase
    .from('images')
    .select('id, url, latitude, longitude')
    .eq('crag_id', climb.crag_id)

  if (imageError) {
    throw imageError
  }

  const imageById = new Map((imageRows || []).map((image) => [image.id, {
    id: image.id,
    url: image.url,
    latitude: image.latitude,
    longitude: image.longitude,
    route_lines_count: 0,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
  } satisfies ImageData]))

  const { targetMaps, effectiveClimbIdByClimbId } = await fetchRouteTargetMapsForClimbIds(supabase, [id], imageById)
  const effectiveClimbId = effectiveClimbIdByClimbId[id] || id
  const target = targetMaps.nextRouteNavigationTargetByClimbId[effectiveClimbId]

  if (!target?.displayImageId || !target?.routeId) {
    return null
  }

  const routeHrefBase = `/${crag.country_code.toLowerCase()}/${crag.slug}`
  const query = new URLSearchParams()
  query.set('image', target.displayImageId)
  query.set('route', target.routeId)
  query.set('climb', effectiveClimbId)

  return `${routeHrefBase}/i/${target.displayImageId}?${query.toString()}`
}

export default async function ClimbPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ route?: string; image?: string; climb?: string }>
}) {
  const { id } = await params
  const resolvedSearchParams = await searchParams

  try {
    const canonicalRedirect = await getCanonicalClimbRedirect(id)
    if (canonicalRedirect) {
      permanentRedirect(canonicalRedirect)
    }

    const payload = await buildClimbOfflinePack(id)
    const fallbackOfflinePath = payload.offline_pack?.canonicalPath || payload.offline_pack?.pageUrl || null
    const climbPath = payload.crag_path || (fallbackOfflinePath?.startsWith('/climb/') ? null : fallbackOfflinePath)
    const requestedRouteId = resolvedSearchParams.route || null
    const selectedRoute = requestedRouteId
      ? payload.primary_route_lines.find((routeLine) => routeLine.id === requestedRouteId) || null
      : null
    const displayImageId = selectedRoute
      ? payload.faces.find((face) => Array.isArray(face.routes) && face.routes.some((route) => route.id === selectedRoute.id))?.display_image_id
        || payload.primary_image?.display_image_id
        || payload.primary_image?.id
        || payload.faces[0]?.display_image_id
        || payload.faces[0]?.image_id
        || null
      : payload.primary_image?.display_image_id
        || payload.primary_image?.id
        || payload.faces[0]?.display_image_id
        || payload.faces[0]?.image_id
        || null
    const routeId = selectedRoute?.id || payload.primary_route_lines[0]?.id || null

    if (!climbPath || !displayImageId) {
      notFound()
    }

    const query = new URLSearchParams()
    query.set('climb', id)
    query.set('image', displayImageId)
    if (routeId) {
      query.set('route', routeId)
    }

    permanentRedirect(`${climbPath}/i/${displayImageId}?${query.toString()}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('redirect:')) {
      throw error
    }
    notFound()
  }
}
