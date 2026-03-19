import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { getDisplayImageId } from '@/lib/image-identity'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { getStableSpatialOrder } from '@/lib/stable-spatial-order'
import type { RoutePoint } from '@/lib/useRouteSelection'

interface CragRow {
  id: string
  slug: string | null
  country_code: string | null
  name: string
}

interface CragImageRow {
  id: string
  linked_image_id: string | null
  url: string
  width: number | null
  height: number | null
  created_at: string | null
  crag_id: string
  sector_id: string | null
  crags: CragRow | CragRow[] | null
}

interface CragImageWithAssetRow extends CragImageRow {
  sectors: { name: string | null } | Array<{ name: string | null }> | null
  images:
    | {
        id: string
        latitude: number | null
        longitude: number | null
        url: string | null
        width: number | null
        height: number | null
      }
    | Array<{
        id: string
        latitude: number | null
        longitude: number | null
        url: string | null
        width: number | null
        height: number | null
      }>
    | null
}

interface ImageAssetRow {
  id: string
  url: string | null
  width: number | null
  height: number | null
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

export interface ImageFirstRouteLine {
  routeId: string
  climbId: string
  climbSlug: string | null
  climbName: string
  climbGrade: string | null
  climbDescription: string | null
  climbRouteType: string | null
  climbAverageStars: number | null
  climbStarVotes: number | null
  pathData: RoutePoint[] | string | null
  color: string
  isPrimary: boolean
}

export interface ImageFirstPayload {
  heroImage: {
    displayImageId: string
    src: string
    width: number
    height: number
    priority: true
  }
  initialRoutes: ImageFirstRouteLine[]
  navigationContext: {
    orderedImageIds: string[]
    startIndex: number
    imageMap: Record<string, { src: string; width: number; height: number }>
    stacks: Array<{ stackId: string; imageIds: string[] }>
    sectorMarkers: Record<string, { name: string; firstImageId: string }>
  }
  initialClimbId: string | null
  initialRouteId: string | null
  initialRouteSlug: string | null
  cragSlug: string
  countryCode: string
  mapPins: Array<{
    imageId: string
    latitude: number
    longitude: number
    routeSlug: string | null
  }>
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

export const getImageByDisplayId = cache(async (displayImageId: string) => {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('crag_images')
    .select('id, linked_image_id, url, width, height, created_at, crag_id, crags(id, slug, country_code, name)')
    .or(`id.eq.${displayImageId},linked_image_id.eq.${displayImageId}`)
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data || []) as unknown as CragImageRow[]
  if (rows.length === 0) return null

  const exactDisplayMatch = rows.find((row) => getDisplayImageId(row) === displayImageId)
  const resolved = exactDisplayMatch || rows[0]
  if (!resolved) return null

  const canonicalId = getDisplayImageId(resolved)
  if (!canonicalId) return null

  const crag = Array.isArray(resolved.crags) ? resolved.crags[0] : resolved.crags
  if (!crag?.slug || !crag.country_code) return null

  let asset: ImageAssetRow | null = null
  if (resolved.linked_image_id) {
    const { data: imageData } = await supabase
      .from('images')
      .select('id, url, width, height')
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
  }
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
  return (data || []) as unknown as RouteLineRow[]
}

export async function buildImageFirstPayload(args: {
  country: string
  crag: string
  imageId: string
  routeId?: string | null
  routeSlug?: string | null
  climbId?: string | null
}): Promise<{ redirectTo: string | null; payload: ImageFirstPayload | null }> {
  const image = await getImageByDisplayId(args.imageId)
  if (!image) return { redirectTo: null, payload: null }

  const canonicalPath = `/${image.countryCode}/${image.cragSlug}/i/${image.canonicalId}`
  const query = new URLSearchParams()
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
    return {
      redirectTo: `${canonicalPath}${query.toString() ? `?${query.toString()}` : ''}`,
      payload: null,
    }
  }

  const [initialRouteRows, cragImageRows] = await Promise.all([
    getRoutesByImage(image.canonicalId),
    (async () => {
      const supabase = await getSupabase()
      const { data, error } = await supabase
        .from('crag_images')
        .select('id, linked_image_id, url, width, height, created_at, sector_id, sectors(name), images:linked_image_id(id, latitude, longitude, url, width, height)')
        .eq('crag_id', image.cragId)
        .order('created_at', { ascending: false })

        if (error) throw error
        return (data || []) as unknown as CragImageWithAssetRow[]
      })(),
  ])

  const spatialNodes = cragImageRows
    .map((row) => {
      const displayId = getDisplayImageId(row)
      if (!displayId) return null
      const linkedImage = Array.isArray(row.images) ? row.images[0] : row.images
        return {
          displayImageId: displayId,
          cragImageId: row.id,
          latitude: linkedImage?.latitude ?? null,
          longitude: linkedImage?.longitude ?? null,
          createdAt: row.created_at,
          sectorId: row.sector_id,
          sectorName: Array.isArray(row.sectors) ? (row.sectors[0]?.name || null) : (row.sectors?.name || null),
        }
      })
    .filter((node): node is NonNullable<typeof node> => node !== null)

  const ordered = getStableSpatialOrder(spatialNodes)
  const imageMap: Record<string, { src: string; width: number; height: number }> = {}
  for (const row of cragImageRows) {
    const displayId = getDisplayImageId(row)
    if (!displayId || imageMap[displayId]) continue
    const linkedImage = Array.isArray(row.images) ? row.images[0] : row.images
    imageMap[displayId] = {
      src: resolveRouteImageUrl(linkedImage?.url || row.url),
      width: linkedImage?.width ?? row.width ?? 1600,
      height: linkedImage?.height ?? row.height ?? 1200,
    }
  }
  imageMap[image.canonicalId] = {
    src: image.staticUrl,
    width: image.width,
    height: image.height,
  }

  const startIndex = ordered.imageIndexByDisplayImageId.get(image.canonicalId) ?? 0
  const sectorMarkers = ordered.orderedStacks.reduce<Record<string, { name: string; firstImageId: string }>>((markers, stack) => {
    const first = stack.images[0]
    if (!first?.sectorId || markers[first.sectorId]) return markers
    markers[first.sectorId] = {
      name: first.sectorName || first.sectorId,
      firstImageId: first.displayImageId,
    }
    return markers
  }, {})
  const initialRoutes = initialRouteRows.map((row, index) => {
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    return {
      routeId: row.id,
      climbId: row.climb_id,
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
  const resolvedRoute = args.routeId
    ? routeById.get(args.routeId) || null
    : args.routeSlug
      ? routeBySlug.get(args.routeSlug) || null
      : null
  const mapPins = spatialNodes
    .filter((node) => typeof node.latitude === 'number' && typeof node.longitude === 'number')
    .reduce<Array<{
      imageId: string
      latitude: number
      longitude: number
      routeSlug: string | null
    }>>((pins, node) => {
      const latitude = node.latitude as number
      const longitude = node.longitude as number
      const duplicate = pins.find((pin) => pin.latitude === latitude && pin.longitude === longitude)
      if (duplicate) return pins

      pins.push({
        imageId: node.displayImageId,
        latitude,
        longitude,
        routeSlug: resolvedRoute?.climbSlug || null,
      })
      return pins
    }, [])

  return {
    redirectTo: null,
    payload: {
      heroImage: {
        displayImageId: image.canonicalId,
        src: image.staticUrl,
        width: image.width,
        height: image.height,
        priority: true,
      },
      initialRoutes,
      navigationContext: {
        orderedImageIds: ordered.orderedImageIds,
        startIndex,
        imageMap,
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
}
