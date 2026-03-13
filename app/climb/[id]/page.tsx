import { notFound, redirect } from 'next/navigation'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'

export default async function ClimbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const payload = await buildClimbOfflinePack(id)
    const cragPath = payload.crag_path
    const displayImageId = payload.primary_image?.display_image_id || payload.primary_image?.id || null
    const defaultRouteId = payload.primary_route_lines[0]?.id || null

    if (!cragPath || !displayImageId) {
      notFound()
    }

    const query = new URLSearchParams()
    query.set('climb', id)
    if (defaultRouteId) {
      query.set('route', defaultRouteId)
    }

    redirect(`${cragPath}/i/${displayImageId}?${query.toString()}`)
  } catch {
    notFound()
  }
}
