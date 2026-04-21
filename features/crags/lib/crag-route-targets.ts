import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { buildCragImageDestination } from '@/features/crags/lib/build-crag-image-destination'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'

export interface RouteLineTargetRow {
  id: string
  image_id: string
  climb_id: string
  climbs: { slug: string | null } | Array<{ slug: string | null }> | null
  images: { url: string | null } | Array<{ url: string | null }> | null
}

export interface ClimbIdentityRow {
  id: string
  shared_climb_id: string | null
}

export interface ResolvedRouteDestination {
  href: string
  ready: boolean
}

export interface RouteTargetFetchResult {
  targetMaps: ReturnType<typeof buildRouteTargetMaps>
  effectiveClimbIdByClimbId: Record<string, string>
}

export interface CragRouteTargetPageRow {
  effective_climb_id: string
  climb_slug: string | null
  preview_image_id: string | null
  preview_image_url: string | null
  navigation_route_id: string | null
  navigation_image_id: string | null
  navigation_image_url: string | null
  route_image_ids: string[] | null
}

export function buildRoutePreviewDisplayByClimbId(
  routePreviewByClimbId: Record<string, RoutePreview>,
  imageById: Map<string, ImageData>
) {
  const nextPreviews: Record<string, RoutePreview> = {}

  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const image = imageById.get(preview.imageId)
    nextPreviews[climbId] = {
      imageId: image?.id || preview.imageId,
      imageUrl: image?.url || preview.imageUrl,
    }
  }

  return nextPreviews
}

export function buildRouteNavigationDisplayByClimbId(
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>,
  imageById: Map<string, ImageData>
) {
  const nextTargets: Record<string, RouteNavigationTarget> = {}

  for (const [climbId, target] of Object.entries(routeNavigationTargetByClimbId)) {
    const displayImage = imageById.get(target.displayImageId)

    nextTargets[climbId] = {
      ...target,
      displayImageId: target.displayImageId,
      displayImageUrl: displayImage?.url || target.displayImageUrl,
    }
  }

  return nextTargets
}

export function getSelectedImageIds(
  selectedImageId: string | null,
  clusteredPins: {
    clusterIdByImageId: Map<string, string>
    clusters: Array<{ id: string; images: Array<{ id: string }> }>
  }
) {
  if (!selectedImageId) return new Set<string>()

  const selectedClusterId = clusteredPins.clusterIdByImageId.get(selectedImageId)
  if (!selectedClusterId) return new Set([selectedImageId])

  const selectedCluster = clusteredPins.clusters.find((cluster) => cluster.id === selectedClusterId)
  if (!selectedCluster) return new Set([selectedImageId])

  return new Set(selectedCluster.images.map((image) => image.id))
}

export function getHighlightedRouteIds(
  routes: CragRoute[],
  selectedImageId: string | null,
  selectedImageIds: Set<string>,
  routeImageIdsByClimbId: Record<string, string[]>,
  routePreviewDisplayByClimbId: Record<string, RoutePreview>,
  routeNavigationDisplayByClimbId: Record<string, RouteNavigationTarget>
) {
  if (!selectedImageId) return new Set<string>()

  const matches = new Set<string>()
  for (const route of routes) {
    const routeImageIds = routeImageIdsByClimbId[route.id] || []
    if (routeImageIds.some((imageId) => selectedImageIds.has(imageId))) {
      matches.add(route.id)
      continue
    }

    if (routePreviewDisplayByClimbId[route.id]?.imageId && selectedImageIds.has(routePreviewDisplayByClimbId[route.id].imageId)) {
      matches.add(route.id)
      continue
    }

    if (routeNavigationDisplayByClimbId[route.id]?.displayImageId && selectedImageIds.has(routeNavigationDisplayByClimbId[route.id].displayImageId)) {
      matches.add(route.id)
    }
  }

  return matches
}

export function hasCompleteRouteTargets(
  routes: CragRoute[],
  routeImageIdsByClimbId: Record<string, string[]>,
  routePreviewByClimbId: Record<string, RoutePreview>,
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
) {
  if (routes.length === 0) return true

  return routes.every((route) => {
    const hasImageIds = (routeImageIdsByClimbId[route.id] || []).length > 0
    const hasPreview = Boolean(routePreviewByClimbId[route.id])
    const hasNavigationTarget = Boolean(routeNavigationTargetByClimbId[route.id])
    return hasImageIds && hasPreview && hasNavigationTarget
  })
}

export function resolveCragRouteDestination(
  route: CragRoute,
  routeNavigationDisplayByClimbId: Record<string, RouteNavigationTarget>,
  routePreviewDisplayByClimbId: Record<string, RoutePreview>,
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>,
  routeHrefBase: string | null,
  offlineOnly: boolean
): ResolvedRouteDestination {
  const routeTarget = routeNavigationDisplayByClimbId[route.id]
  if (routeTarget) {
    const routeClimbId = routeTarget.climbId || route.id
    return {
      href: buildCragImageDestination({
        imageId: routeTarget.displayImageId,
        target: {
          ...routeTarget,
          climbId: routeClimbId,
          climbSlug: route.slug || routeTarget.climbSlug,
        },
        routeHrefBase,
        offlineOnly,
      }),
      ready: true,
    }
  }

  const preview = routePreviewDisplayByClimbId[route.id]
  const fallbackImageId = preview?.imageId
  const fallbackTarget = fallbackImageId ? defaultRouteTargetByImageId[fallbackImageId] : undefined

  if (fallbackImageId && fallbackTarget) {
    return {
      href: buildCragImageDestination({
        imageId: fallbackImageId,
        target: {
          ...fallbackTarget,
          climbId: fallbackTarget.climbId || route.id,
          routeId: fallbackTarget.routeId || route.id,
          climbSlug: route.slug || fallbackTarget.climbSlug,
        },
        routeHrefBase,
        offlineOnly,
      }),
      ready: true,
    }
  }

  if (!offlineOnly && fallbackImageId) {
    return {
      href: buildCragImageDestination({
        imageId: fallbackImageId,
        routeHrefBase,
        offlineOnly: false,
      }),
      ready: false,
    }
  }

  if (offlineOnly) {
    return {
      href: `/climb/${route.id}`,
      ready: true,
    }
  }

  if (route.slug && routeHrefBase) {
    return {
      href: `${routeHrefBase}/${route.slug}`,
      ready: false,
    }
  }

  return {
    href: `/climb/${route.id}`,
    ready: false,
  }
}

export function buildRouteTargetMaps(
  routeTargetsData: RouteLineTargetRow[],
  effectiveClimbIdByClimbId: Record<string, string>,
  imageById: Map<string, ImageData>,
  selectableImageIdByImageId: Record<string, string> = {}
) {
  const nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
  const nextRouteImageIdsByClimbId: Record<string, string[]> = {}

  for (const row of routeTargetsData) {
    const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
    const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
    const climbImageIds = nextRouteImageIdsByClimbId[effectiveClimbId] || []
    if (!climbImageIds.includes(selectableImageId)) {
      climbImageIds.push(selectableImageId)
      nextRouteImageIdsByClimbId[effectiveClimbId] = climbImageIds
    }
    if (nextDefaultRouteTargetByImageId[selectableImageId]) continue
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    nextDefaultRouteTargetByImageId[selectableImageId] = {
      climbId: row.climb_id,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: selectableImageId,
    }
  }

  const mappedTargets = mapRouteTargetsByEffectiveClimbId(
    routeTargetsData,
    imageById,
    effectiveClimbIdByClimbId,
    selectableImageIdByImageId
  )

  return {
    nextDefaultRouteTargetByImageId,
    nextRouteImageIdsByClimbId,
    nextRoutePreviewByClimbId: mappedTargets.nextRoutePreviewByClimbId,
    nextRouteNavigationTargetByClimbId: mappedTargets.nextRouteNavigationTargetByClimbId,
  }
}

export function remapRoutePreviewsByEffectiveClimbId(
  routePreviewByClimbId: Record<string, RoutePreview>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextPreviewByClimbId: Record<string, RoutePreview> = {}
  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
    if (!nextPreviewByClimbId[effectiveClimbId]) {
      nextPreviewByClimbId[effectiveClimbId] = preview
    }
  }
  return nextPreviewByClimbId
}

export function remapRouteNavigationTargetsByEffectiveClimbId(
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextTargets: Record<string, RouteNavigationTarget> = {}

  for (const [climbId, target] of Object.entries(routeNavigationTargetByClimbId)) {
    const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
    if (!nextTargets[effectiveClimbId]) {
      nextTargets[effectiveClimbId] = target.climbId === effectiveClimbId
        ? target
        : {
            ...target,
            climbId: effectiveClimbId,
          }
    }
  }

  return nextTargets
}

export function buildEffectiveClimbLookup(rows: ClimbIdentityRow[]) {
  const effectiveClimbIdByClimbId = Object.fromEntries(rows.map((row) => [row.id, row.shared_climb_id || row.id]))
  const climbIdsByEffectiveClimbId = rows.reduce<Record<string, string[]>>((acc, row) => {
    const effectiveClimbId = row.shared_climb_id || row.id
    const existing = acc[effectiveClimbId] || []
    existing.push(row.id)
    acc[effectiveClimbId] = existing
    return acc
  }, {})
  return { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId }
}

export function mapRouteTargetsByEffectiveClimbId(
  routeTargetsData: RouteLineTargetRow[],
  imageById: Map<string, ImageData>,
  effectiveClimbIdByClimbId: Record<string, string>,
  selectableImageIdByImageId: Record<string, string> = {}
) {
  const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
  const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}
  for (const row of routeTargetsData) {
    const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
    if (nextRouteNavigationTargetByClimbId[effectiveClimbId]) continue
    const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
    const image = imageById.get(selectableImageId)
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    const joinedImage = Array.isArray(row.images) ? row.images[0] : row.images
    const imageUrl = image?.url || joinedImage?.url || null

    if (!imageUrl) continue

    nextRoutePreviewByClimbId[effectiveClimbId] = { imageId: selectableImageId, imageUrl }
    nextRouteNavigationTargetByClimbId[effectiveClimbId] = {
      climbId: effectiveClimbId,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: selectableImageId,
      displayImageId: selectableImageId,
      displayImageUrl: imageUrl,
    }
  }
  return { nextRoutePreviewByClimbId, nextRouteNavigationTargetByClimbId }
}

export async function fetchRouteTargetMapsForClimbIds(
  supabase: SupabaseClient<Database>,
  climbIds: string[],
  imageById: Map<string, ImageData>,
  selectableImageIdByImageId: Record<string, string> = {}
): Promise<RouteTargetFetchResult> {
  if (climbIds.length === 0) {
    return {
      targetMaps: buildRouteTargetMaps([], {}, imageById, selectableImageIdByImageId),
      effectiveClimbIdByClimbId: {},
    }
  }

  const { data: climbIdentityData, error: climbIdentityError } = await supabase
    .from('climbs')
    .select('id, shared_climb_id')
    .or(`id.in.(${climbIds.join(',')}),shared_climb_id.in.(${climbIds.join(',')})`)

  if (climbIdentityError) {
    throw climbIdentityError
  }

  const { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId } = buildEffectiveClimbLookup(
    (climbIdentityData || []) as ClimbIdentityRow[]
  )
  const routeLineClimbIds = Array.from(new Set([
    ...climbIds,
    ...climbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || []),
  ]))

  const { data: routeTargetsData, error: routeTargetsError } = await supabase
    .from('route_lines')
    .select('id, image_id, climb_id, climbs(slug), images(url)')
    .in('climb_id', routeLineClimbIds)
    .order('climb_id', { ascending: true })
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (routeTargetsError) {
    throw routeTargetsError
  }

  const targetMaps = buildRouteTargetMaps(
    (routeTargetsData || []) as RouteLineTargetRow[],
    effectiveClimbIdByClimbId,
    imageById,
    selectableImageIdByImageId
  )

  return {
    targetMaps,
    effectiveClimbIdByClimbId,
  }
}

export function buildRouteTargetMapsFromPageRows(pageRows: CragRouteTargetPageRow[]) {
  const nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
  const nextRouteImageIdsByClimbId: Record<string, string[]> = {}
  const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
  const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}

  for (const row of pageRows) {
    const climbId = row.effective_climb_id
    const routeImageIds = Array.isArray(row.route_image_ids)
      ? row.route_image_ids.filter((imageId): imageId is string => Boolean(imageId))
      : []

    if (routeImageIds.length > 0) {
      nextRouteImageIdsByClimbId[climbId] = routeImageIds
    }

    if (row.preview_image_id && row.preview_image_url) {
      nextRoutePreviewByClimbId[climbId] = {
        imageId: row.preview_image_id,
        imageUrl: row.preview_image_url,
      }
    }

    if (row.navigation_route_id && row.navigation_image_id && row.navigation_image_url) {
      nextRouteNavigationTargetByClimbId[climbId] = {
        climbId,
        routeId: row.navigation_route_id,
        climbSlug: row.climb_slug,
        imageId: row.navigation_image_id,
        displayImageId: row.navigation_image_id,
        displayImageUrl: row.navigation_image_url,
      }

      if (!nextDefaultRouteTargetByImageId[row.navigation_image_id]) {
        nextDefaultRouteTargetByImageId[row.navigation_image_id] = {
          climbId,
          routeId: row.navigation_route_id,
          climbSlug: row.climb_slug,
          imageId: row.navigation_image_id,
        }
      }
    }
  }

  return {
    nextDefaultRouteTargetByImageId,
    nextRouteImageIdsByClimbId,
    nextRoutePreviewByClimbId,
    nextRouteNavigationTargetByClimbId,
  }
}

export async function fetchCragRouteTargetPage(
  supabase: SupabaseClient<Database>,
  cragId: string,
  limit: number,
  offset: number
) {
  const { data, error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: CragRouteTargetPageRow[] | null; error: Error | null }> }).rpc('get_crag_route_targets_page', {
    p_crag_id: cragId,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) throw error

  const resolvedRows = ((Array.isArray(data) ? data : []) as CragRouteTargetPageRow[]).map((row: CragRouteTargetPageRow) => ({
    ...row,
    preview_image_url: row.preview_image_url
      ? resolveRouteImageUrl(row.preview_image_url)
      : null,
    navigation_image_url: row.navigation_image_url
      ? resolveRouteImageUrl(row.navigation_image_url)
      : null,
  }))

  return buildRouteTargetMapsFromPageRows(resolvedRows as CragRouteTargetPageRow[])
}

export async function fetchAllCragRoutePreviews(
  supabase: SupabaseClient<Database>,
  cragId: string,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  return fetchCragRoutePreviewsBatched(supabase, cragId, effectiveClimbIdByClimbId, { limit: undefined })
}

export async function fetchCragRoutePreviewsBatched(
  supabase: SupabaseClient<Database>,
  cragId: string,
  effectiveClimbIdByClimbId: Record<string, string>,
  options?: { limit?: number }
) {
  const limit = options?.limit
  const targetMaps = await fetchCragRouteTargetPage(supabase, cragId, limit ?? 1000000, 0)

  const routeImageIdsByClimbId = { ...targetMaps.nextRouteImageIdsByClimbId }
  const routePreviewByClimbId = { ...targetMaps.nextRoutePreviewByClimbId }
  const routeNavigationTargetByClimbId = { ...targetMaps.nextRouteNavigationTargetByClimbId }
  const defaultTargetByImageId = { ...targetMaps.nextDefaultRouteTargetByImageId }

  for (const climbId of Object.keys(effectiveClimbIdByClimbId)) {
    const effectiveId = effectiveClimbIdByClimbId[climbId]
    if (effectiveId !== climbId && routePreviewByClimbId[effectiveId] && !routePreviewByClimbId[climbId]) {
      routePreviewByClimbId[climbId] = routePreviewByClimbId[effectiveId]
    }
    if (effectiveId !== climbId && routeNavigationTargetByClimbId[effectiveId] && !routeNavigationTargetByClimbId[climbId]) {
      routeNavigationTargetByClimbId[climbId] = routeNavigationTargetByClimbId[effectiveId]
    }
    if (effectiveId !== climbId && routeImageIdsByClimbId[effectiveId] && !routeImageIdsByClimbId[climbId]) {
      routeImageIdsByClimbId[climbId] = routeImageIdsByClimbId[effectiveId]
    }
  }

  return {
    nextRoutePreviewByClimbId: routePreviewByClimbId,
    nextRouteNavigationTargetByClimbId: routeNavigationTargetByClimbId,
    nextRouteImageIdsByClimbId: routeImageIdsByClimbId,
    nextDefaultRouteTargetByImageId: defaultTargetByImageId,
  }
}
