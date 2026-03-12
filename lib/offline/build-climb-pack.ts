import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { RoutePoint } from '@/lib/useRouteSelection'
import { buildMediaProxyUrl, estimateCompressedImageBytes, parsePrivateMediaRef } from '@/lib/media-proxy'
import type { ClimbPackResponse, OfflineMapPin } from '@/lib/climb/queries'
import { buildTileManifestForPins } from '@/lib/offline/tiles'
import { resolveRouteImageUrl } from '@/lib/route-image-url'

interface ImageInfoRow {
  id: string
  url: string
  crag_id: string | null
  latitude: number | null
  longitude: number | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  face_directions: string[] | null
}

interface ClimbInfo {
  id: string
  name: string
  grade: string
  slug?: string | null
  route_type: string | null
  description: string | null
}

interface FullContextRouteLine {
  id: string
  points: unknown
  color: string | null
  image_width: number | null
  image_height: number | null
  climb_id: string
  climb: ClimbInfo | null
}

interface FaceRouteSummary {
  id: string
  climb_id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
}

interface CompleteSummaryFace {
  image_id: string | null
  index: number
  is_primary: boolean
  url: string | null
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata: {
    width: number | null
    height: number | null
  } | null
  routes: FaceRouteSummary[]
  has_routes: boolean
}

interface CompleteSummaryPayload {
  faces: CompleteSummaryFace[]
  summary: {
    total_faces: number
    total_routes: number
  }
}

interface FullContextPayload {
  climb: ClimbInfo | null
  primary_image: ImageInfoRow | null
  primary_route_lines: FullContextRouteLine[]
  faces: CompleteSummaryFace[]
  summary?: {
    total_faces: number
    total_routes: number
  }
}

interface LegacyClimbRow {
  id: string
  name: string
  grade: string
  slug?: string | null
  route_type: string | null
  image_url: string
  coordinates: unknown
  crag_id?: string | null
}

interface CragRow {
  id: string
  country_code: string | null
  slug: string | null
  name?: string | null
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  is_public: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

interface RouteFaceRow {
  route_id: string
  image_id: string
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  climb: ClimbInfo | ClimbInfo[] | null
  image: { id: string; url: string | null; width: number | null; height: number | null; face_directions: string[] | null } | Array<{ id: string; url: string | null; width: number | null; height: number | null; face_directions: string[] | null }> | null
  crag_image: { id: string; url: string | null; width: number | null; height: number | null; linked_image_id: string | null } | Array<{ id: string; url: string | null; width: number | null; height: number | null; linked_image_id: string | null }> | null
}

interface RouteFaceQueryRow {
  id: string
  image_id: string
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  climb: ClimbInfo | ClimbInfo[] | null
  image: RouteFaceRow['image']
  crag_image: RouteFaceRow['crag_image']
}

function getFaceIdentityKey(face: Pick<CompleteSummaryFace, 'image_id' | 'linked_image_id' | 'crag_image_id' | 'index'>) {
  return face.image_id || face.linked_image_id || (face.crag_image_id ? `crag-image:${face.crag_image_id}` : `index:${face.index}`)
}

function mergeFaceRoutes(existing: FaceRouteSummary[], incoming: FaceRouteSummary[]) {
  const byId = new Map<string, FaceRouteSummary>()

  for (const route of existing) {
    byId.set(route.id, route)
  }

  for (const route of incoming) {
    const current = byId.get(route.id)
    if (!current) {
      byId.set(route.id, route)
      continue
    }

    byId.set(route.id, {
      ...current,
      ...route,
      color: route.color || current.color,
      points: route.points ?? current.points,
      image_width: route.image_width ?? current.image_width,
      image_height: route.image_height ?? current.image_height,
      sequence_order: route.sequence_order ?? current.sequence_order,
    })
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aOrder = a.sequence_order ?? Number.MAX_SAFE_INTEGER
    const bOrder = b.sequence_order ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.id.localeCompare(b.id)
  })
}

function mergeFaces(existing: CompleteSummaryFace | undefined, incoming: CompleteSummaryFace) {
  if (!existing) return incoming

  const mergedRoutes = mergeFaceRoutes(existing.routes, incoming.routes)
  const existingRouteCount = existing.routes.length
  const incomingRouteCount = incoming.routes.length

  return {
    ...existing,
    ...incoming,
    index: Math.min(existing.index, incoming.index),
    is_primary: existing.is_primary || incoming.is_primary,
    url: incoming.url || existing.url,
    image_id: incoming.image_id || existing.image_id,
    linked_image_id: incoming.linked_image_id || existing.linked_image_id,
    crag_image_id: incoming.crag_image_id || existing.crag_image_id,
    face_directions: incoming.face_directions && incoming.face_directions.length > 0
      ? incoming.face_directions
      : existing.face_directions,
    metadata: incoming.metadata?.width || incoming.metadata?.height ? incoming.metadata : existing.metadata,
    routes: mergedRoutes,
    has_routes: existing.has_routes || incoming.has_routes || mergedRoutes.length > 0,
    ...(incomingRouteCount > existingRouteCount ? { url: incoming.url || existing.url } : {}),
  }
}

function buildPrimaryFallbackFace(primaryImage: ImageInfoRow): CompleteSummaryFace {
  return {
    image_id: primaryImage.id,
    index: 0,
    is_primary: true,
    url: primaryImage.url,
    linked_image_id: null,
    crag_image_id: null,
    face_directions: primaryImage.face_directions,
    metadata: {
      width: primaryImage.natural_width || primaryImage.width,
      height: primaryImage.natural_height || primaryImage.height,
    },
    routes: [],
    has_routes: true,
  }
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error('Supabase service role is not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function hashValue(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function decorateMedia(rawUrl: string | null | undefined, versionSeed: string | null | undefined) {
  if (!rawUrl) {
    return {
      url: '',
      media_ref: null,
      cache_key: null,
      version: null,
    }
  }

  const parsed = parsePrivateMediaRef(rawUrl)
  if (!parsed) {
    const normalizedUrl = resolveRouteImageUrl(rawUrl)
    return {
      url: normalizedUrl,
      media_ref: null,
      cache_key: normalizedUrl,
      version: versionSeed || normalizedUrl,
    }
  }

  const version = versionSeed || hashValue([parsed.bucket, parsed.path])
  return {
    url: buildMediaProxyUrl(parsed.bucket, parsed.path, version),
    media_ref: rawUrl,
    cache_key: `${parsed.bucket}:${parsed.path}`,
    version,
  }
}

function resolveCanonicalPaths(crag: CragRow | null, climb: ClimbInfo | null, climbId: string) {
  const cragPath = crag?.country_code && crag?.slug
    ? `/${crag.country_code.toLowerCase()}/${crag.slug}`
    : (crag?.id ? `/crag/${crag.id}` : null)

  const climbPath = cragPath && climb?.slug
    ? `${cragPath}/${climb.slug}`
    : `/climb/${climbId}`

  return {
    cragPath,
    climbPath,
  }
}

function buildPrimaryPin(input: {
  climbId: string
  climbName: string
  canonicalPath: string
  coverImageUrl: string | null
  latitude: number | null
  longitude: number | null
}): OfflineMapPin | null {
  if (
    typeof input.latitude !== 'number'
    || typeof input.longitude !== 'number'
    || !Number.isFinite(input.latitude)
    || !Number.isFinite(input.longitude)
    || input.latitude < -85.05112878
    || input.latitude > 85.05112878
    || input.longitude < -180
    || input.longitude > 180
  ) {
    return null
  }

  return {
    climbId: input.climbId,
    climbName: input.climbName,
    canonicalPath: input.canonicalPath,
    coverImageUrl: input.coverImageUrl,
    latitude: input.latitude,
    longitude: input.longitude,
  }
}

export async function buildClimbOfflinePack(climbId: string): Promise<ClimbPackResponse> {
  const supabase = getAdminClient()
  const { data: fullContext, error: fullContextError } = await supabase
    .rpc('get_climb_full_context', { p_climb_id: climbId })

  if (fullContextError) {
    throw fullContextError
  }

  const context = fullContext as FullContextPayload | null
  if (!context?.climb?.id) {
    throw new Error('Climb not found')
  }

  if (!context.primary_image?.id) {
    const { data: legacyClimb, error: legacyError } = await supabase
      .from('climbs')
      .select('id, name, grade, slug, route_type, image_url, coordinates, crag_id')
      .eq('id', climbId)
      .single()

    if (legacyError) {
      throw legacyError
    }

    const legacy = legacyClimb as LegacyClimbRow
    const cragData = legacy.crag_id
      ? await supabase.from('crags').select('id, country_code, slug, name').eq('id', legacy.crag_id).maybeSingle()
      : { data: null, error: null }
    const canonical = resolveCanonicalPaths(cragData.data as CragRow | null, { ...legacy, description: null }, legacy.id)
    const legacyMedia = decorateMedia(legacy.image_url, hashValue([legacy.id, legacy.image_url, legacy.coordinates]))
    const estimatedBytes = estimateCompressedImageBytes(null, null)
    const version = hashValue([legacy.id, legacy.name, legacy.grade, legacy.route_type, legacy.coordinates, legacyMedia.version, canonical.climbPath])

    return {
      climb: {
        id: legacy.id,
        name: legacy.name,
        grade: legacy.grade,
        route_type: legacy.route_type,
        description: null,
      },
      primary_image: {
        id: `legacy-${legacy.id}`,
        url: legacyMedia.url,
        crag_id: legacy.crag_id || null,
        latitude: null,
        longitude: null,
        width: null,
        height: null,
        natural_width: null,
        natural_height: null,
        created_by: null,
        is_anonymous_submission: false,
        contribution_credit_platform: null,
        contribution_credit_handle: null,
        face_directions: null,
        media_ref: legacyMedia.media_ref,
        cache_key: legacyMedia.cache_key,
        version: legacyMedia.version,
      },
      primary_route_lines: [{
        id: `legacy-${legacy.id}`,
        points: legacy.coordinates as RoutePoint[] | string | null,
        color: '#ef4444',
        image_width: null,
        image_height: null,
        climb_id: legacy.id,
        climb: {
          id: legacy.id,
          name: legacy.name,
          grade: legacy.grade,
          route_type: legacy.route_type,
          description: null,
        },
      }],
      faces: [{
        id: `legacy-${legacy.id}`,
        index: 0,
        image_id: `legacy-${legacy.id}`,
        is_primary: true,
        url: legacyMedia.url,
        has_routes: true,
        linked_image_id: null,
        crag_image_id: null,
        face_directions: null,
        metadata: { width: null, height: null },
        routes: [],
        media_ref: legacyMedia.media_ref,
        cache_key: legacyMedia.cache_key,
        version: legacyMedia.version,
      }],
      summary: { total_faces: 1, total_routes: 1 },
      crag_path: canonical.cragPath,
      public_submitter: null,
      offline_pack: {
        packId: `climb:${legacy.id}`,
        type: 'climb',
        climbId: legacy.id,
        climbName: legacy.name,
        version,
        manifestUrl: `/api/offline-packs/climbs/${legacy.id}`,
        pageUrl: canonical.climbPath,
        canonicalPath: canonical.climbPath,
        mediaUrls: [legacyMedia.url].filter(Boolean),
        mediaCount: 1,
        estimatedBytes,
        cragId: legacy.crag_id || null,
        coverImageUrl: legacyMedia.url,
        primaryPin: null,
        tileUrls: [],
        tileCount: 0,
      },
    }
  }

  const primaryImage = context.primary_image
  const [completeSummaryResult, cragResult, profileResult, primaryImageGeoResult, routeFaceRowsResult] = await Promise.all([
    supabase.rpc('get_crag_faces_complete_summary', { p_image_id: primaryImage.id }),
    primaryImage.crag_id
      ? supabase.from('crags').select('id, country_code, slug, name').eq('id', primaryImage.crag_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    primaryImage.created_by
      ? supabase
          .from('profiles')
          .select('id, username, display_name, first_name, last_name, is_public, contribution_credit_platform, contribution_credit_handle')
          .eq('id', primaryImage.created_by)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('images')
      .select('latitude, longitude')
      .eq('id', primaryImage.id)
      .maybeSingle(),
    supabase
      .from('route_lines')
      .select(`
        id,
        image_id,
        color,
        points,
        image_width,
        image_height,
        sequence_order,
        climb:climbs!inner(id, name, grade, route_type, description),
        image:images!inner(id, url, width, height, face_directions),
        crag_image:crag_images(id, url, width, height, linked_image_id)
      `)
      .eq('climb_id', climbId)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ])

  const completeSummary = (!completeSummaryResult.error && completeSummaryResult.data)
    ? completeSummaryResult.data as CompleteSummaryPayload
    : null
  const primaryImageGeo = ('data' in primaryImageGeoResult ? primaryImageGeoResult.data : null) as { latitude: number | null; longitude: number | null } | null
  const routeFaceRows = (!routeFaceRowsResult.error && Array.isArray(routeFaceRowsResult.data))
    ? (routeFaceRowsResult.data as unknown as RouteFaceQueryRow[]).map((row) => ({
        route_id: row.id,
        image_id: row.image_id,
        color: row.color,
        points: row.points,
        image_width: row.image_width,
        image_height: row.image_height,
        sequence_order: row.sequence_order,
        climb: row.climb,
        image: row.image,
        crag_image: row.crag_image,
      }))
    : []

  const baseFacesSource = Array.isArray(completeSummary?.faces) && completeSummary.faces.length > 0
    ? completeSummary.faces
    : Array.isArray(context.faces)
      ? context.faces
      : []

  const mergedFaceMap = new Map<string, CompleteSummaryFace>()
  const primaryFallbackFace = buildPrimaryFallbackFace(primaryImage)
  for (const face of baseFacesSource) {
    mergedFaceMap.set(getFaceIdentityKey(face), face)
  }

  const routeDiscoveredFaceMap = new Map<string, CompleteSummaryFace>()
  for (const row of routeFaceRows) {
    const climb = Array.isArray(row.climb) ? row.climb[0] : row.climb
    const image = Array.isArray(row.image) ? row.image[0] : row.image
    const cragImage = Array.isArray(row.crag_image) ? row.crag_image[0] : row.crag_image
    if (!image?.id || !image.url || !climb?.id) continue

    const discoveredFace: CompleteSummaryFace = {
      image_id: image.id,
      index: Number.MAX_SAFE_INTEGER,
      is_primary: image.id === primaryImage.id,
      url: cragImage?.url || image.url,
      linked_image_id: cragImage?.linked_image_id || image.id,
      crag_image_id: cragImage?.id || null,
      face_directions: Array.isArray(image.face_directions) ? image.face_directions : null,
      metadata: {
        width: cragImage?.width ?? image.width ?? null,
        height: cragImage?.height ?? image.height ?? null,
      },
      routes: [{
        id: row.route_id,
        climb_id: climb.id,
        name: climb.name,
        grade: climb.grade,
        route_type: climb.route_type,
        description: climb.description,
        color: row.color,
        points: row.points,
        image_width: row.image_width,
        image_height: row.image_height,
        sequence_order: row.sequence_order,
      }],
      has_routes: true,
    }

    const key = getFaceIdentityKey(discoveredFace)
    routeDiscoveredFaceMap.set(key, mergeFaces(routeDiscoveredFaceMap.get(key), discoveredFace))
  }

  for (const [key, discoveredFace] of routeDiscoveredFaceMap.entries()) {
    mergedFaceMap.set(key, mergeFaces(mergedFaceMap.get(key), discoveredFace))
  }

  const hasPrimaryFace = Array.from(mergedFaceMap.values()).some((face) => face.image_id === primaryImage.id)
  if (!hasPrimaryFace) {
    mergedFaceMap.set(getFaceIdentityKey(primaryFallbackFace), primaryFallbackFace)
  }

  const facesSource = Array.from(mergedFaceMap.values())
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
      if (a.index !== b.index) return a.index - b.index
      return getFaceIdentityKey(a).localeCompare(getFaceIdentityKey(b))
    })
    .map((face, index) => ({
      ...face,
      index,
    }))

  const decoratedPrimary = decorateMedia(
    primaryImage.url,
    hashValue([primaryImage.id, primaryImage.url, primaryImage.natural_width, primaryImage.natural_height])
  )

  let estimatedBytes = estimateCompressedImageBytes(primaryImage.natural_width || primaryImage.width, primaryImage.natural_height || primaryImage.height)

  const faces = facesSource
    .map((face) => {
      if (!face?.url) return null
      const width = face.metadata?.width ?? null
      const height = face.metadata?.height ?? null
      const versionSeed = hashValue([
        face.image_id,
        face.linked_image_id,
        face.crag_image_id,
        face.url,
        width,
        height,
        face.routes,
        face.face_directions,
      ])
      const decorated = decorateMedia(face.url, versionSeed)
      estimatedBytes += estimateCompressedImageBytes(width, height)

      return {
        id: face.is_primary ? `image:${primaryImage.id}` : `crag-image:${face.crag_image_id || face.index}`,
        index: face.index,
        image_id: face.image_id,
        is_primary: face.is_primary,
        url: decorated.url,
        has_routes: face.has_routes || (Array.isArray(face.routes) && face.routes.length > 0),
        linked_image_id: face.linked_image_id === primaryImage.id ? null : face.linked_image_id,
        crag_image_id: face.crag_image_id,
        face_directions: Array.isArray(face.face_directions) ? face.face_directions : null,
        metadata: { width, height },
        routes: Array.isArray(face.routes)
          ? face.routes.map((route) => ({
              ...route,
              points: route.points as RoutePoint[] | string | null,
            }))
          : [],
        media_ref: decorated.media_ref,
        cache_key: decorated.cache_key,
        version: decorated.version,
      }
    })
    .filter((face): face is NonNullable<typeof face> => face !== null)

  const crag = ('data' in cragResult ? cragResult.data : null) as CragRow | null
  const canonical = resolveCanonicalPaths(crag, context.climb, climbId)
  const profileData = ('data' in profileResult ? profileResult.data : null) as ProfileRow | null
  const publicSubmitter = !primaryImage.is_anonymous_submission && profileData?.is_public
    ? {
        id: profileData.id,
        displayName: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || profileData.display_name || profileData.username || 'Climber',
        contributionCreditPlatform: primaryImage.contribution_credit_platform,
        contributionCreditHandle: primaryImage.contribution_credit_handle,
        profileContributionCreditPlatform: profileData.contribution_credit_platform,
        profileContributionCreditHandle: profileData.contribution_credit_handle,
      }
    : null

  const mediaUrls = Array.from(new Set([decoratedPrimary.url, ...faces.map((face) => face.url)].filter(Boolean)))
  const primaryPin = buildPrimaryPin({
    climbId,
    climbName: context.climb.name,
    canonicalPath: canonical.climbPath,
    coverImageUrl: decoratedPrimary.url,
    latitude: primaryImageGeo?.latitude ?? null,
    longitude: primaryImageGeo?.longitude ?? null,
  })
  const tileManifest = primaryPin ? buildTileManifestForPins([primaryPin]) : null
  const version = hashValue({
    climb: context.climb,
    canonicalPath: canonical.climbPath,
    primaryImage: {
      id: primaryImage.id,
      version: decoratedPrimary.version,
      width: primaryImage.width,
      height: primaryImage.height,
    },
    faces: faces.map((face) => ({
      id: face.id,
      version: face.version,
      routes: face.routes,
    })),
    routeLines: context.primary_route_lines,
  })

  return {
    climb: context.climb,
    primary_image: {
      ...primaryImage,
      url: decoratedPrimary.url,
      latitude: primaryImageGeo?.latitude ?? null,
      longitude: primaryImageGeo?.longitude ?? null,
      media_ref: decoratedPrimary.media_ref,
      cache_key: decoratedPrimary.cache_key,
      version: decoratedPrimary.version,
    },
    primary_route_lines: Array.isArray(context.primary_route_lines)
      ? context.primary_route_lines.map((line) => ({
          ...line,
          points: line.points as RoutePoint[] | string | null,
        }))
      : [],
    faces,
    summary: completeSummary?.summary || context.summary || {
      total_faces: Math.max(1, faces.length),
      total_routes: Array.isArray(context.primary_route_lines) ? context.primary_route_lines.length : 0,
    },
    crag_path: canonical.cragPath,
    public_submitter: publicSubmitter,
    offline_pack: {
      packId: `climb:${climbId}`,
      type: 'climb',
      climbId,
      climbName: context.climb.name,
      version,
      manifestUrl: `/api/offline-packs/climbs/${climbId}`,
      pageUrl: canonical.climbPath,
      canonicalPath: canonical.climbPath,
      mediaUrls,
      mediaCount: mediaUrls.length,
      estimatedBytes,
      cragId: primaryImage.crag_id || null,
      coverImageUrl: decoratedPrimary.url,
      primaryPin,
      tileUrls: tileManifest?.tileUrls || [],
      tileCount: tileManifest?.tileCount || 0,
    },
  }
}
