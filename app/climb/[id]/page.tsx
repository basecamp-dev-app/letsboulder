import { notFound, permanentRedirect } from 'next/navigation'
import { getDisplayImageId } from '@/lib/image-identity'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function getCanonicalClimbRedirect(id: string) {
  const supabase = getUnauthenticatedClient()
  const { data: climb, error: climbError } = await supabase
    .from('climbs')
    .select('id, shared_climb_id, crag_id, crags(country_code, slug)')
    .eq('id', id)
    .maybeSingle()

  if (climbError) {
    throw climbError
  }

  const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags
  if (!climb?.crag_id || !crag?.country_code || !crag?.slug) {
    return null
  }

  const effectiveClimbId = climb.shared_climb_id || climb.id
  const { data: aliasRows, error: aliasError } = await supabase
    .from('climbs')
    .select('id')
    .or(`id.eq.${effectiveClimbId},shared_climb_id.eq.${effectiveClimbId}`)

  if (aliasError) {
    throw aliasError
  }

  const climbIds = Array.from(new Set((aliasRows || []).map((row) => row.id).filter(Boolean)))
  if (climbIds.length === 0) {
    return null
  }

  const { data: routeRows, error: routeError } = await supabase
    .from('route_lines')
    .select('id, image_id, climb_id')
    .in('climb_id', climbIds)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (routeError) {
    throw routeError
  }

  const route = (routeRows || [])[0]
  if (!route?.id || !route.image_id) {
    return null
  }

  const { data: cragImageRows, error: cragImageError } = await supabase
    .from('crag_images')
    .select('id, linked_image_id')
    .eq('crag_id', climb.crag_id)
    .eq('linked_image_id', route.image_id)
    .order('created_at', { ascending: false })

  if (cragImageError) {
    throw cragImageError
  }

  const routeHrefBase = `/${crag.country_code.toLowerCase()}/${crag.slug}`
  const displayImageId = getDisplayImageId((cragImageRows || [])[0]) || route.image_id
  const query = new URLSearchParams()
  query.set('image', displayImageId)
  query.set('route', route.id)
  query.set('climb', effectiveClimbId)

  const redirectUrl = `${routeHrefBase}/i/${displayImageId}?${query.toString()}`
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
  await searchParams

  try {
    const canonicalRedirect = await getCanonicalClimbRedirect(id)
    if (canonicalRedirect) {
      permanentRedirect(canonicalRedirect)
    }
    notFound()
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('redirect:') || error.message === 'NEXT_REDIRECT')) {
      throw error
    }
    notFound()
  }
}
