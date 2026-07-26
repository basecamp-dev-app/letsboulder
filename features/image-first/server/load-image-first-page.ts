import { cache } from 'react'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { getDisplayImageId } from '@/lib/image-identity'
import { buildThumbnailUrl } from '@/lib/media/thumbnail-url'
import { getStableSpatialOrder } from '@/lib/stable-spatial-order'
import { startServerTiming, timeServerStep } from '@/lib/performance/server-timing'
import type { RoutePoint } from '@/types/domain'
import { buildRouteAttribution } from '@/features/image-first/lib/route-attribution'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/features/image-first/types'
import type { ProfileRow } from '@/lib/profile-helpers'

interface RoutePageAttributionRow {
  created_by: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

async function getImageAttribution(displayImageId: string) {
  const supabase = await getSupabase()
  const [{ data: imageRow }, contributorCountResult] = await Promise.all([
    supabase
      .from('images')
      .select('created_by, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle')
      .eq('id', displayImageId)
      .maybeSingle(),
    supabase
      .from('submission_contributors')
      .select('user_id', { count: 'exact', head: true })
      .eq('image_id', displayImageId),
  ])

  const typedImage = (imageRow || {
    created_by: null,
    is_anonymous_submission: false,
    contribution_credit_platform: null,
    contribution_credit_handle: null,
  }) as RoutePageAttributionRow

  const uploaderProfile = typedImage.created_by
    ? await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_public')
        .eq('id', typedImage.created_by)
        .maybeSingle()
    : { data: null }

  return {
    image: typedImage,
    uploaderProfile: (uploaderProfile.data || null) as ProfileRow | null,
    communityEditorsCount: contributorCountResult.count || 0,
  }
}

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
  latitude: number | null
  longitude: number | null
  created_at: string | null
  crags: CragRow | CragRow[] | null
}

type ResolvedImageRow = {
  id: string
  linked_image_id: string | null
  url: string
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
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
  latitude: number | null
  longitude: number | null
  cragSlug: string
  countryCode: string
  cragId: string
  cragName: string
  fromCragImages: boolean
}

const ROUTE_PAGE_IMAGE_WIDTH = 1200

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
        shared_climb_id: string | null
      }
    | Array<{
        id: string
        name: string | null
        slug: string | null
        grade: string | null
        description: string | null
        route_type: string | null
        shared_climb_id: string | null
      }>
    | null
}

async function getSupabase() {
  return getUnauthenticatedClient()
}

async function resolveCragImageRow(displayImageId: string): Promise<ResolvedImageRow | null> {
  const supabase = await getSupabase()
  const baseSelect = 'id, linked_image_id, url, width, height, latitude, longitude, created_at, crag_id, crags(id, slug, country_code, name)'

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
        .select('id, crag_id, url, width, height, created_at, latitude, longitude, crags(id, slug, country_code, name)')
        .eq('id', resolved.linked_image_id)
        .maybeSingle()
      asset = (imageData as ImageAssetRow | null) || null
    }

    const src = buildThumbnailUrl(asset?.url || resolved.url, ROUTE_PAGE_IMAGE_WIDTH)
    return {
      canonicalId,
      redirectRequired: canonicalId !== displayImageId,
      staticUrl: src,
      width: asset?.width ?? resolved.width ?? 1600,
      height: asset?.height ?? resolved.height ?? 1200,
      latitude: asset?.latitude ?? resolved.latitude ?? null,
      longitude: asset?.longitude ?? resolved.longitude ?? null,
      cragSlug: crag.slug,
      countryCode: crag.country_code.toLowerCase(),
      cragId: crag.id,
      cragName: crag.name,
      fromCragImages: true,
    } satisfies ResolvedImageRecord
  }

  const { data: rawImageData, error: rawImageError } = await supabase
    .from('images')
    .select('id, crag_id, url, width, height, created_at, latitude, longitude, crags(id, slug, country_code, name)')
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
    staticUrl: buildThumbnailUrl(rawImage.url, ROUTE_PAGE_IMAGE_WIDTH),
    width: rawImage.width ?? 1600,
    height: rawImage.height ?? 1200,
    latitude: rawImage.latitude ?? null,
    longitude: rawImage.longitude ?? null,
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
      climbs (id, name, slug, grade, description, route_type, shared_climb_id)
    `)
    .eq('image_id', displayImageId)
    .order('sequence_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []) as RouteLineRow[]
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

  const [initialRouteRows, cragImages, cragImageRows, attributionData] = await Promise.all([
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
    getImageAttribution(image.canonicalId),
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
        orderedStacks: [],
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
      src: buildThumbnailUrl(row.url, ROUTE_PAGE_IMAGE_WIDTH),
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
      effectiveClimbId: climb?.shared_climb_id || row.climb_id,
      imageId: image.canonicalId,
      climbSlug: climb?.slug || null,
      climbName: climb?.name || 'Unnamed route',
      climbGrade: climb?.grade || null,
      climbDescription: climb?.description || null,
      climbRouteType: climb?.route_type || null,
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
  const mapPins = ordered.orderedStacks.map((stack) => {
    const activeImageIds = stack.images.map((imageNode) => imageNode.displayImageId)
    const primaryImageId = activeImageIds[0] || stack.stackId
    return {
      imageId: stack.stackId,
      latitude: stack.latitude,
      longitude: stack.longitude,
      activeImageIds,
      primaryImageId,
      routeSlug: resolvedRoute?.climbSlug || null,
    }
  })

  const result = {
    redirectTo: null,
    payload: {
      heroImage: {
        displayImageId: image.canonicalId,
        src: image.staticUrl,
        width: image.width,
        height: image.height,
        latitude: image.latitude,
        longitude: image.longitude,
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
      cragId: image.cragId,
      cragSlug: image.cragSlug,
      cragName: image.cragName,
      countryCode: image.countryCode,
      mapPins,
      attribution: buildRouteAttribution({
        image: attributionData.image,
        uploaderProfile: attributionData.uploaderProfile,
        communityEditorsCount: attributionData.communityEditorsCount,
      }),
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
