import { notFound, permanentRedirect } from 'next/navigation'
import { getDisplayImageId } from '@/lib/image-identity'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { buildClimbOfflinePack } from '@/lib/offline/build-climb-pack'

async function getCanonicalClimbRedirect(id: string) {
  const supabase = getUnauthenticatedClient()
  const { data: climb, error: climbError } = await supabase
    .from('climbs')
    .select('id, shared_climb_id, crag_id, crags(country_code, slug)')
    .eq('id', id)
    .maybeSingle()

  if (climbError) {
    console.log('[Climb Redirect] climb lookup failed', { id, error: climbError })
    throw climbError
  }

  const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags
  if (!climb?.crag_id || !crag?.country_code || !crag?.slug) {
    console.log('[Climb Redirect] missing crag path inputs', { id, climbId: climb?.id || null, cragId: climb?.crag_id || null, crag: crag || null })
    return null
  }

  const effectiveClimbId = climb.shared_climb_id || climb.id
  const { data: aliasRows, error: aliasError } = await supabase
    .from('climbs')
    .select('id')
    .or(`id.eq.${effectiveClimbId},shared_climb_id.eq.${effectiveClimbId}`)

  if (aliasError) {
    console.log('[Climb Redirect] alias lookup failed', { id, effectiveClimbId, error: aliasError })
    throw aliasError
  }

  const climbIds = Array.from(new Set((aliasRows || []).map((row) => row.id).filter(Boolean)))
  if (climbIds.length === 0) {
    console.log('[Climb Redirect] no alias climb ids found', { id, effectiveClimbId })
    return null
  }

  const { data: routeRows, error: routeError } = await supabase
    .from('route_lines')
    .select('id, image_id, climb_id')
    .in('climb_id', climbIds)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (routeError) {
    console.log('[Climb Redirect] route lookup failed', { id, climbIds, error: routeError })
    throw routeError
  }

  const route = (routeRows || [])[0]
  if (!route?.id || !route.image_id) {
    console.log('[Climb Redirect] no route target found', { id, effectiveClimbId, climbIds, routeCount: routeRows?.length || 0 })
    return null
  }

  const { data: cragImageRows, error: cragImageError } = await supabase
    .from('crag_images')
    .select('id, linked_image_id')
    .eq('crag_id', climb.crag_id)
    .eq('linked_image_id', route.image_id)
    .order('created_at', { ascending: false })

  if (cragImageError) {
    console.log('[Climb Redirect] crag image lookup failed', { id, cragId: climb.crag_id, routeImageId: route.image_id, error: cragImageError })
    throw cragImageError
  }

  const routeHrefBase = `/${crag.country_code.toLowerCase()}/${crag.slug}`
  const displayImageId = getDisplayImageId((cragImageRows || [])[0]) || route.image_id
  const query = new URLSearchParams()
  query.set('image', displayImageId)
  query.set('route', route.id)
  query.set('climb', effectiveClimbId)

  const redirectUrl = `${routeHrefBase}/i/${displayImageId}?${query.toString()}`
  console.log('[Climb Redirect] canonical redirect resolved', {
    id,
    effectiveClimbId,
    climbIds,
    routeId: route.id,
    routeImageId: route.image_id,
    displayImageId,
    cragImageCount: cragImageRows?.length || 0,
    redirectUrl,
  })
  return redirectUrl
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
      console.log('[Climb Redirect] redirecting to canonical target', { id, canonicalRedirect })
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
      console.log('[Climb Redirect] fallback missing redirect inputs', {
        id,
        climbPath,
        displayImageId,
        routeId,
        primaryRouteCount: payload.primary_route_lines.length,
        faceCount: payload.faces.length,
      })
      notFound()
    }

    const query = new URLSearchParams()
    query.set('climb', id)
    query.set('image', displayImageId)
    if (routeId) {
      query.set('route', routeId)
    }

    const fallbackRedirect = `${climbPath}/i/${displayImageId}?${query.toString()}`
    console.log('[Climb Redirect] redirecting via fallback path', {
      id,
      fallbackRedirect,
      routeId,
      displayImageId,
    })
    permanentRedirect(fallbackRedirect)
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('redirect:') || error.message === 'NEXT_REDIRECT')) {
      throw error
    }
    console.log('[Climb Redirect] failed', {
      id,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    })
    notFound()
  }
}
