import { notFound, redirect } from 'next/navigation'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'

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
    const payload = await buildClimbOfflinePack(id)
    const climbPath = payload.offline_pack?.canonicalPath || payload.offline_pack?.pageUrl || payload.crag_path || null
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

    redirect(`${climbPath}/i/${displayImageId}?${query.toString()}`)
  } catch {
    notFound()
  }
}
