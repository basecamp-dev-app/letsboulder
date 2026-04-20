import type { RoutePoint } from '@/types/domain'
import { getCanonicalRouteFaces } from '@/features/climb/lib/canonical-logic'
import { estimateCompressedImageBytes } from '@/lib/media-proxy'
import type { ClimbPackResponse } from '@/features/climb/lib/queries'
import { buildRouteAttribution } from '@/features/image-first/lib/route-attribution'
import { getDisplayImageId } from '@/lib/image-identity'
import { buildTileManifestForPins } from '@/lib/offline/tiles'
import { reportError } from '@/lib/errors'
import { buildPrimaryPin, buildPrimaryFallbackFace, decorateMedia, getOfflinePackClient, getFaceIdentityKey, hashValue, isPublicOfflineClimbVisible, mergeFaces, resolveCanonicalPaths } from '@/lib/offline/build-climb-pack-helpers'
import type { CompleteSummaryFace, CompleteSummaryPayload, CragRow, FullContextPayload, LegacyClimbRow, ProfileRow, RouteFaceQueryRow, RouteFaceRow } from '@/lib/offline/build-climb-pack-types'

function buildOfflineImageFirstUrl(input: {
  cragPath: string | null
  climbId: string
  displayImageId: string | null
  routeId: string | null
}) {
  if (!input.cragPath || !input.displayImageId) return null

  const query = new URLSearchParams()
  query.set('image', input.displayImageId)
  if (input.routeId) {
    query.set('route', input.routeId)
  }
  query.set('climb', input.climbId)
  return `${input.cragPath}/i/${input.displayImageId}?${query.toString()}`
}

export async function buildClimbOfflinePack(climbId: string): Promise<ClimbPackResponse> {
  const supabase = getOfflinePackClient()
  const isVisible = await isPublicOfflineClimbVisible(supabase, climbId)
  if (!isVisible) {
    throw new Error('Climb not found')
  }

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
        display_image_id: `legacy-${legacy.id}`,
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
        display_image_id: `legacy-${legacy.id}`,
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
  const contributorCountResultPromise = (async () => {
    try {
      const result = await supabase
        .from('submission_contributors')
        .select('user_id', { count: 'exact', head: true })
        .eq('image_id', primaryImage.id)

      return { count: result.count || 0 }
    } catch {
      return { count: 0 }
    }
  })()

  const [completeSummaryResult, cragResult, profileResult, primaryImageGeoResult, contributorCountResult] = await Promise.all([
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
    contributorCountResultPromise,
  ])

  const completeSummary = (!completeSummaryResult.error && completeSummaryResult.data)
    ? completeSummaryResult.data as CompleteSummaryPayload
    : null
  const primaryImageGeo = ('data' in primaryImageGeoResult ? primaryImageGeoResult.data : null) as { latitude: number | null; longitude: number | null } | null
  const communityEditorsCount = contributorCountResult.count || 0
  let canonicalRouteFaces: Awaited<ReturnType<typeof getCanonicalRouteFaces>> | null = null
  let routeFaceRows: RouteFaceRow[] = []

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
  if (primaryImage.crag_id) {
    try {
      canonicalRouteFaces = await getCanonicalRouteFaces(supabase as never, primaryImage.crag_id, climbId)

      const aliasClimbIds = canonicalRouteFaces.aliasClimbIds.length > 0
        ? canonicalRouteFaces.aliasClimbIds
        : [climbId]

      const { data: routeFaceRowsData, error: routeFaceRowsError } = await supabase
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
          image:images!inner(id, url, width, height, face_directions)
        `)
        .in('climb_id', aliasClimbIds)
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (routeFaceRowsError) {
        throw routeFaceRowsError
      }

      const routeFaceImageIds = Array.from(new Set(
        ((routeFaceRowsData || []) as RouteFaceQueryRow[])
          .map((row) => row.image_id)
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      ))

      let cragImageByLinkedImageId = new Map<string, RouteFaceRow['crag_image']>()
      if (routeFaceImageIds.length > 0) {
        const { data: cragImageRows, error: cragImageRowsError } = await supabase
          .from('crag_images')
          .select('id, url, width, height, linked_image_id')
          .in('linked_image_id', routeFaceImageIds)
          .order('created_at', { ascending: false })

        if (cragImageRowsError) {
          throw cragImageRowsError
        }

        cragImageByLinkedImageId = new Map(
          ((cragImageRows || []) as Array<NonNullable<RouteFaceRow['crag_image']>>)
            .filter((row) => typeof row.linked_image_id === 'string' && row.linked_image_id.length > 0)
            .map((row) => [row.linked_image_id as string, row])
        )
      }

      routeFaceRows = Array.isArray(routeFaceRowsData)
        ? (routeFaceRowsData as RouteFaceQueryRow[]).map((row) => ({
            route_id: row.id,
            image_id: row.image_id,
            color: row.color,
            points: row.points,
            image_width: row.image_width,
            image_height: row.image_height,
            sequence_order: row.sequence_order,
            climb: row.climb,
            image: row.image,
            crag_image: cragImageByLinkedImageId.get(row.image_id) || null,
          }))
        : []

      for (const row of routeFaceRows) {
        const climb = Array.isArray(row.climb) ? row.climb[0] : row.climb
        const image = Array.isArray(row.image) ? row.image[0] : row.image
        const cragImage = row.crag_image
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

      for (const preview of canonicalRouteFaces.previewFaces || []) {
        if (!preview.imageId || !preview.imageUrl) continue

        const discoveredFace: CompleteSummaryFace = {
          image_id: preview.imageId,
          index: Number.MAX_SAFE_INTEGER,
          is_primary: preview.imageId === primaryImage.id,
          url: preview.imageUrl,
          linked_image_id: preview.imageId,
          crag_image_id: null,
          face_directions: null,
          metadata: null,
          routes: [],
          has_routes: true,
        }

        const key = getFaceIdentityKey(discoveredFace)
        mergedFaceMap.set(key, mergeFaces(mergedFaceMap.get(key), discoveredFace))
      }
    } catch (error) {
      reportError(error, { message: 'Canonical route enrichment failed' })
      canonicalRouteFaces = null
      routeFaceRows = []
      routeDiscoveredFaceMap.clear()
    }
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
        display_image_id: getDisplayImageId({ image_id: face.image_id, linked_image_id: face.linked_image_id, id: face.crag_image_id }),
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
  const routeAttribution = buildRouteAttribution({
    image: {
      is_anonymous_submission: primaryImage.is_anonymous_submission,
      contribution_credit_platform: primaryImage.contribution_credit_platform,
      contribution_credit_handle: primaryImage.contribution_credit_handle,
    },
    uploaderProfile: (profileData || null) as ProfileRow | null,
    communityEditorsCount,
  })

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
  const primaryDisplayImageId = getDisplayImageId({ linked_image_id: primaryImage.id }) || primaryImage.id
  const imageFirstUrl = buildOfflineImageFirstUrl({
    cragPath: canonical.cragPath,
    climbId,
    displayImageId: primaryDisplayImageId,
    routeId: context.primary_route_lines[0]?.id || null,
  })
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
      display_image_id: getDisplayImageId({ image_id: primaryImage.id }),
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
    route_attribution: routeAttribution,
    offline_pack: {
      packId: `climb:${climbId}`,
      type: 'climb',
      climbId,
      climbName: context.climb.name,
      version,
      manifestUrl: `/api/offline-packs/climbs/${climbId}`,
      pageUrl: canonical.climbPath,
      canonicalPath: canonical.climbPath,
      imageFirstUrl,
      offlineLaunchUrl: imageFirstUrl || canonical.climbPath,
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
