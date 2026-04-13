import { cache } from 'react'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { getDisplayImageId } from '@/lib/image-identity'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { getStableSpatialOrder } from '@/lib/stable-spatial-order'
import { startServerTiming, timeServerStep } from '@/lib/performance/server-timing'
import { getStoredClimbManifest, getStoredClimbManifestByImageId } from '@/lib/offline/storage'
import type { RoutePoint } from '@/types/domain'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/features/image-first/types'
import type { ClimbPackResponse } from '@/features/climb/lib/queries'

interface CragRow {
  id: string
  slug: string | null
  country_code: string | null
  name: string
}

interface ImageAssetRow {
  id: string
  crag_id: string
  url: string | null
  width: number | null
  height: number | null
  created_at: string | null
  crags: CragRow | CragRow[] | null
}

type ResolvedImageRow = {
  id: string
  linked_image_id: string | null
  url: string
  width: number | null
  height: number | null
  created_at: string | null
  crag_id: string
  crags: CragRow | CragRow[] | null
}

type ResolvedImageRecord = {
  canonicalId: string
  redirectRequired: boolean
  staticUrl: string
  width: number
  height: number
  cragSlug: string
  countryCode: string
  cragId: string
  cragName: string
  fromCragImages: boolean
}

interface RouteLineRow {
  id: string
  climb_id: string
  points: RoutePoint[] | string | null
  color: string | null
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  created_at?: string | null
  climbs:
    | {
        id: string
        name: string | null
        slug: string | null
        grade: string | null
        description: string | null
        route_type: string | null
        average_stars: number | null
        star_votes: number | null
      }
    | Array<{
        id: string
        name: string | null
        slug: string | null
        grade: string | null
        description: string | null
        route_type: string | null
        average_stars: number | null
        star_votes: number | null
      }>
    | null
}

async function getSupabase() {
  return getUnauthenticatedClient()
}

async function resolveCragImageRow(displayImageId: string): Promise<ResolvedImageRow | null> {
  const supabase = await getSupabase()
  const baseSelect = 'id, linked_image_id, url, width, height, created_at, crag_id, crags(id, slug, country_code, name)'

  const { data, error } = await supabase
    .from('crag_images')
    .select(baseSelect)
    .or(`id.eq.${displayImageId},linked_image_id.eq.${displayImageId}`)
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data || []) as ResolvedImageRow[]
  if (rows.length > 0) {
    const exactDisplayMatch = rows.find((row) => getDisplayImageId(row) === displayImageId)
    return exactDisplayMatch || rows[0] || null
  }

  const { data: asset, error: assetError } = await supabase
    .from('images')
    .select('id')
    .eq('id', displayImageId)
    .maybeSingle()

  if (assetError) throw assetError
  if (!asset?.id) return null

  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('crag_images')
    .select(baseSelect)
    .eq('linked_image_id', asset.id)
    .order('created_at', { ascending: false })

  if (fallbackError) throw fallbackError

  return ((fallbackRows || []) as ResolvedImageRow[])[0] || null
}

export const getImageByDisplayId = cache(async (displayImageId: string) => {
  const supabase = await getSupabase()
  const resolved = await resolveCragImageRow(displayImageId)
  if (resolved) {
    const canonicalId = getDisplayImageId(resolved)
    if (!canonicalId) return null

    const crag = Array.isArray(resolved.crags) ? resolved.crags[0] : resolved.crags
    if (!crag?.slug || !crag.country_code) return null

    let asset: ImageAssetRow | null = null
    if (resolved.linked_image_id) {
      const { data: imageData } = await supabase
        .from('images')
        .select('id, crag_id, url, width, height, created_at, crags(id, slug, country_code, name)')
        .eq('id', resolved.linked_image_id)
        .maybeSingle()
      asset = (imageData as ImageAssetRow | null) || null
    }

    const src = resolveRouteImageUrl(asset?.url || resolved.url)
    return {
      canonicalId,
      redirectRequired: canonicalId !== displayImageId,
      staticUrl: src,
      width: asset?.width ?? resolved.width ?? 1600,
      height: asset?.height ?? resolved.height ?? 1200,
      cragSlug: crag.slug,
      countryCode: crag.country_code.toLowerCase(),
      cragId: crag.id,
      cragName: crag.name,
      fromCragImages: true,
    } satisfies ResolvedImageRecord
  }

  const { data: rawImageData, error: rawImageError } = await supabase
    .from('images')
    .select('id, crag_id, url, width, height, created_at, crags(id, slug, country_code, name)')
    .eq('id', displayImageId)
    .maybeSingle()

  if (rawImageError) throw rawImageError
  const rawImage = rawImageData as ImageAssetRow | null
  if (!rawImage) return null

  const crag = Array.isArray(rawImage.crags) ? rawImage.crags[0] : rawImage.crags
  if (!crag?.slug || !crag.country_code || !rawImage.url) return null

  return {
    canonicalId: rawImage.id,
    redirectRequired: false,
    staticUrl: resolveRouteImageUrl(rawImage.url),
    width: rawImage.width ?? 1600,
    height: rawImage.height ?? 1200,
    cragSlug: crag.slug,
    countryCode: crag.country_code.toLowerCase(),
    cragId: crag.id,
    cragName: crag.name,
    fromCragImages: false,
  } satisfies ResolvedImageRecord
})

export async function getRoutesByImage(displayImageId: string) {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('route_lines')
    .select(`
      id,
      climb_id,
      points,
      color,
      image_width,
      image_height,
      sequence_order,
      created_at,
      climbs (id, name, slug, grade, description, route_type)
    `)
    .eq('image_id', displayImageId)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []) as RouteLineRow[]
}

function buildOfflineImageFirstPayload(
  payload: ClimbPackResponse,
  args: {
    country: string
    crag: string
    imageId: string
    selectedImageId?: string | null
    routeId?: string | null
    routeSlug?: string | null
    climbId?: string | null
  }
): { redirectTo: string | null; payload: ImageFirstPayload | null } {
  const heroFace = payload.faces.find((face) => {
    const displayId = face.display_image_id || face.image_id || face.id
    return displayId === args.imageId || face.image_id === args.imageId || face.id === args.imageId
  }) || payload.faces[0] || null

  const heroDisplayImageId = heroFace?.display_image_id || heroFace?.image_id || payload.primary_image?.display_image_id || payload.primary_image?.id || null
  const heroSrc = resolveRouteImageUrl(heroFace?.url || payload.primary_image?.url)

  if (!heroDisplayImageId || !heroSrc) {
    return { redirectTo: null, payload: null }
  }

  const offlinePath = payload.offline_pack.offlineLaunchUrl || payload.offline_pack.canonicalPath || payload.offline_pack.pageUrl
  const pathParts = offlinePath.split('/').filter(Boolean)
  const countryCode = pathParts[0]?.toLowerCase() || args.country.toLowerCase()
  const cragSlug = pathParts[1] || args.crag
  const canonicalPath = `/${countryCode}/${cragSlug}/i/${heroDisplayImageId}`
  const query = new URLSearchParams()
  if (args.selectedImageId) query.set('image', args.selectedImageId)
  if (args.routeSlug) query.set('route', args.routeSlug)
  else if (args.routeId) query.set('route', args.routeId)
  if (args.climbId) query.set('climb', args.climbId)

  if (countryCode !== args.country.toLowerCase() || cragSlug !== args.crag || heroDisplayImageId !== args.imageId) {
    return {
      redirectTo: `${canonicalPath}${query.toString() ? `?${query.toString()}` : ''}`,
      payload: null,
    }
  }

  const imageMap: Record<string, { src: string; width: number; height: number }> = {}
  const linkedImageIdByDisplayId: Record<string, string> = {}
  const orderedImageIds: string[] = []
  const initialRoutes: ImageFirstRouteLine[] = []

  for (const face of payload.faces) {
    const displayImageId = face.display_image_id || face.image_id || face.id
    const linkedImageId = face.image_id || displayImageId
    if (!imageMap[displayImageId]) {
      imageMap[displayImageId] = {
        src: resolveRouteImageUrl(face.url),
        width: face.metadata?.width ?? payload.primary_image?.width ?? 1600,
        height: face.metadata?.height ?? payload.primary_image?.height ?? 1200,
      }
      orderedImageIds.push(displayImageId)
    }
    linkedImageIdByDisplayId[displayImageId] = linkedImageId

    for (const route of face.routes || []) {
      initialRoutes.push({
        routeId: route.id,
        climbId: route.climb_id,
        imageId: displayImageId,
        climbSlug: payload.climb?.id === route.climb_id ? pathParts[2] || null : null,
        climbName: route.name || payload.climb?.name || 'Unnamed route',
        climbGrade: route.grade || payload.climb?.grade || null,
        climbDescription: route.description || payload.climb?.description || null,
        climbRouteType: route.route_type || payload.climb?.route_type || null,
        climbAverageStars: null,
        climbStarVotes: null,
        pathData: route.points,
        color: route.color || '#ef4444',
        isPrimary: displayImageId === heroDisplayImageId,
      })
    }
  }

  if (payload.primary_route_lines.length > 0 && initialRoutes.length === 0) {
    for (const route of payload.primary_route_lines) {
      initialRoutes.push({
        routeId: route.id,
        climbId: route.climb_id,
        imageId: heroDisplayImageId,
        climbSlug: pathParts[2] || null,
        climbName: route.climb?.name || payload.climb?.name || 'Unnamed route',
        climbGrade: route.climb?.grade || payload.climb?.grade || null,
        climbDescription: route.climb?.description || payload.climb?.description || null,
        climbRouteType: route.climb?.route_type || payload.climb?.route_type || null,
        climbAverageStars: null,
        climbStarVotes: null,
        pathData: route.points,
        color: route.color || '#ef4444',
        isPrimary: true,
      })
    }
  }

  const routeById = new Map(initialRoutes.map((route) => [route.routeId, route] as const))
  const routeBySlug = new Map(initialRoutes.filter((route) => route.climbSlug).map((route) => [route.climbSlug as string, route] as const))
  const resolvedRoute = args.routeId && routeById.has(args.routeId)
    ? routeById.get(args.routeId) || null
    : args.routeSlug && routeBySlug.has(args.routeSlug)
      ? routeBySlug.get(args.routeSlug) || null
      : null

  const spatialNodes = payload.faces.map((face) => ({
    displayImageId: face.display_image_id || face.image_id || face.id,
    latitude: payload.primary_image?.latitude ?? null,
    longitude: payload.primary_image?.longitude ?? null,
    createdAt: null,
  }))
  const ordered = orderedImageIds.length > 0
    ? getStableSpatialOrder(spatialNodes)
    : {
        orderedImageIds: [heroDisplayImageId],
        orderedStacks: [{ stackId: heroDisplayImageId, images: [{ displayImageId: heroDisplayImageId, latitude: null, longitude: null, createdAt: null }] }],
        imageIndexByDisplayImageId: new Map([[heroDisplayImageId, 0]]),
      }

  return {
    redirectTo: null,
    payload: {
      heroImage: {
        displayImageId: heroDisplayImageId,
        src: heroSrc,
        width: imageMap[heroDisplayImageId]?.width || payload.primary_image?.width || 1600,
        height: imageMap[heroDisplayImageId]?.height || payload.primary_image?.height || 1200,
        priority: true,
      },
      initialRoutes,
      navigationContext: {
        orderedImageIds: ordered.orderedImageIds,
        startIndex: ordered.imageIndexByDisplayImageId.get(heroDisplayImageId) ?? 0,
        imageMap,
        linkedImageIdByDisplayId,
        stacks: ordered.orderedStacks.map((stack) => ({
          stackId: stack.stackId,
          imageIds: stack.images.map((imageNode) => imageNode.displayImageId),
        })),
        sectorMarkers: {},
      },
      initialClimbId: args.climbId || payload.climb?.id || resolvedRoute?.climbId || null,
      initialRouteId: resolvedRoute?.routeId || args.routeId || payload.primary_route_lines[0]?.id || null,
      initialRouteSlug: args.routeSlug || resolvedRoute?.climbSlug || pathParts[2] || null,
      cragSlug,
      countryCode,
      mapPins: typeof payload.primary_image?.latitude === 'number' && typeof payload.primary_image?.longitude === 'number'
        ? [{
            imageId: heroDisplayImageId,
            latitude: payload.primary_image.latitude,
            longitude: payload.primary_image.longitude,
            activeImageIds: ordered.orderedImageIds,
            routeSlug: args.routeSlug || resolvedRoute?.climbSlug || pathParts[2] || null,
          }]
        : [],
    },
  }
}

export async function buildImageFirstPayload(args: {
  country: string
  crag: string
  imageId: string
  selectedImageId?: string | null
  routeId?: string | null
  routeSlug?: string | null
  climbId?: string | null
}): Promise<{ redirectTo: string | null; payload: ImageFirstPayload | null }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const stored = args.climbId
      ? await getStoredClimbManifest(args.climbId)
      : await getStoredClimbManifestByImageId(args.imageId)
    if (stored?.payload) {
      return buildOfflineImageFirstPayload(stored.payload, args)
    }
  }

  const timing = startServerTiming('buildImageFirstPayload')
  const image = await timeServerStep('buildImageFirstPayload', 'resolve-image', () => getImageByDisplayId(args.imageId))
  if (!image) return { redirectTo: null, payload: null }

  const canonicalPath = `/${image.countryCode}/${image.cragSlug}/i/${image.canonicalId}`
  const query = new URLSearchParams()
  if (args.selectedImageId) query.set('image', args.selectedImageId)
  if (args.routeSlug) {
    query.set('route', args.routeSlug)
  } else if (args.routeId) {
    query.set('route', args.routeId)
  }
  if (args.climbId) query.set('climb', args.climbId)

  if (
    image.redirectRequired
    || image.countryCode !== args.country.toLowerCase()
    || image.cragSlug !== args.crag
  ) {
    timing.end({ redirect: true, cragId: image.cragId })
    return {
      redirectTo: `${canonicalPath}${query.toString() ? `?${query.toString()}` : ''}`,
      payload: null,
    }
  }

  const [initialRouteRows, cragImages, cragImageRows] = await Promise.all([
    timeServerStep('buildImageFirstPayload', 'initial-routes', () => getRoutesByImage(image.canonicalId)),
    (async () => {
      return timeServerStep('buildImageFirstPayload', 'crag-images', async () => {
        const supabase = await getSupabase()
        const { data, error } = await supabase
          .from('images')
          .select('id, url, width, height, created_at, latitude, longitude')
          .eq('crag_id', image.cragId)
          .order('created_at', { ascending: false })

        if (error) throw error
        return (data || []) as Array<{
          id: string
          url: string
          width: number | null
          height: number | null
          created_at: string | null
          latitude: number | null
          longitude: number | null
        }>
      })
    })(),
    (async () => {
      return timeServerStep('buildImageFirstPayload', 'crag-image-links', async () => {
        const supabase = await getSupabase()
        const { data, error } = await supabase
          .from('crag_images')
          .select('id, linked_image_id')
          .eq('crag_id', image.cragId)

        if (error) return []
        return (data || []) as Array<{
          id: string
          linked_image_id: string | null
        }>
      })
    })(),
  ])

  const linkedImageIdByDisplayId: Record<string, string> = {}
  for (const row of cragImageRows) {
    if (row.linked_image_id) {
      linkedImageIdByDisplayId[row.id] = row.linked_image_id
    }
  }
  linkedImageIdByDisplayId[image.canonicalId] = image.canonicalId

  const spatialNodes = cragImages.map((row) => ({
    displayImageId: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
  }))

  const ordered = spatialNodes.length > 0
    ? getStableSpatialOrder(spatialNodes)
    : {
        orderedImageIds: [image.canonicalId],
        orderedStacks: [{ stackId: image.canonicalId, images: [{ displayImageId: image.canonicalId, latitude: null, longitude: null, createdAt: null }] }],
        imageIndexByDisplayImageId: new Map([[image.canonicalId, 0]]),
      }
  timing.step('stable-spatial-order', {
    images: spatialNodes.length,
    orderedImageIds: ordered.orderedImageIds.length,
  })
  const imageMap: Record<string, { src: string; width: number; height: number }> = {}
  for (const row of cragImages) {
    if (imageMap[row.id]) continue
    imageMap[row.id] = {
      src: resolveRouteImageUrl(row.url),
      width: row.width ?? 1600,
      height: row.height ?? 1200,
    }
  }
  imageMap[image.canonicalId] = {
    src: image.staticUrl,
    width: image.width,
    height: image.height,
  }

  const startIndex = ordered.imageIndexByDisplayImageId.get(image.canonicalId) ?? 0
  const sectorMarkers: Record<string, { name: string; firstImageId: string }> = {}
  const initialRoutes: ImageFirstRouteLine[] = initialRouteRows.map((row, index) => {
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    return {
      routeId: row.id,
      climbId: row.climb_id,
      imageId: image.canonicalId,
      climbSlug: climb?.slug || null,
      climbName: climb?.name || 'Unnamed route',
      climbGrade: climb?.grade || null,
      climbDescription: climb?.description || null,
      climbRouteType: climb?.route_type || null,
      climbAverageStars: climb?.average_stars ?? null,
      climbStarVotes: climb?.star_votes ?? null,
      pathData: row.points,
      color: row.color || '#ef4444',
      isPrimary: index === 0,
    }
  })

  const routeById = new Map(initialRoutes.map((route) => [route.routeId, route] as const))
  const routeBySlug = new Map(
    initialRoutes
      .filter((route) => route.climbSlug)
      .map((route) => [route.climbSlug, route] as const)
  )
  const resolvedRoute = args.routeId && routeById.has(args.routeId)
    ? routeById.get(args.routeId) || null
    : args.routeSlug && routeBySlug.has(args.routeSlug)
      ? routeBySlug.get(args.routeSlug) || null
      : args.routeId
        ? routeBySlug.get(args.routeId) || null
        : args.routeSlug
          ? routeById.get(args.routeSlug) || null
          : null
  const mapPins = spatialNodes
    .filter((node) => typeof node.latitude === 'number' && typeof node.longitude === 'number')
    .reduce<Array<{
      imageId: string
      latitude: number
      longitude: number
      activeImageIds: string[]
      routeSlug: string | null
    }>>((pins, node) => {
      const latitude = node.latitude as number
      const longitude = node.longitude as number
      const duplicate = pins.find((pin) => pin.latitude === latitude && pin.longitude === longitude)
      if (duplicate) {
        if (!duplicate.activeImageIds.includes(node.displayImageId)) {
          duplicate.activeImageIds.push(node.displayImageId)
        }
        return pins
      }

      pins.push({
        imageId: node.displayImageId,
        latitude,
        longitude,
        activeImageIds: [node.displayImageId],
        routeSlug: resolvedRoute?.climbSlug || null,
      })
      return pins
    }, [])

  const result = {
    redirectTo: null,
    payload: {
      heroImage: {
        displayImageId: image.canonicalId,
        src: image.staticUrl,
        width: image.width,
        height: image.height,
        priority: true as const,
      },
      initialRoutes,
      navigationContext: {
        orderedImageIds: ordered.orderedImageIds,
        startIndex,
        imageMap,
        linkedImageIdByDisplayId,
        stacks: ordered.orderedStacks.map((stack) => ({
          stackId: stack.stackId,
          imageIds: stack.images.map((imageNode) => imageNode.displayImageId),
        })),
        sectorMarkers,
      },
      initialClimbId: args.climbId || resolvedRoute?.climbId || null,
      initialRouteId: resolvedRoute?.routeId || null,
      initialRouteSlug: args.routeSlug || resolvedRoute?.climbSlug || null,
      cragSlug: image.cragSlug,
      countryCode: image.countryCode,
      mapPins,
    },
  }

  timing.end({
    cragId: image?.cragId,
    initialRoutes: initialRouteRows.length,
    cragImages: cragImages.length,
    cragImageLinks: cragImageRows.length,
  })

  return result
}
