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
    const cragPath = payload.crag_path
    const requestedRouteId = resolvedSearchParams.route || null
    const selectedRoute = requestedRouteId
      ? payload.primary_route_lines.find((routeLine) => routeLine.id === requestedRouteId) || null
      : null
    const displayImageId = selectedRoute
      ? payload.faces.find((face) => Array.isArray(face.routes) && face.routes.some((route) => route.id === selectedRoute.id))?.display_image_id
        || payload.primary_image?.display_image_id
        || payload.primary_image?.id
        || null
      : payload.primary_image?.display_image_id || payload.primary_image?.id || null
    const routeId = selectedRoute?.id || payload.primary_route_lines[0]?.id || null

    if (!cragPath || !displayImageId) {
      notFound()
    }

    const query = new URLSearchParams()
    query.set('climb', id)
    query.set('image', displayImageId)
    if (routeId) {
      query.set('route', routeId)
    }

    redirect(`${cragPath}/i/${displayImageId}?${query.toString()}`)
  } catch {
    notFound()
  }
}
