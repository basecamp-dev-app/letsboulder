import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { RoutePoint } from '@/lib/useRouteSelection'
import { buildMediaProxyUrl, estimateCompressedImageBytes, parsePrivateMediaRef } from '@/lib/media-proxy'
import type { ClimbPackResponse } from '@/lib/climb/queries'

interface ImageInfoRow {
  id: string
  url: string
  crag_id: string | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
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
    return {
      url: rawUrl,
      media_ref: null,
      cache_key: rawUrl,
      version: versionSeed || rawUrl,
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
        width: null,
        height: null,
        natural_width: null,
        natural_height: null,
        created_by: null,
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
      },
    }
  }

  const primaryImage = context.primary_image
  const [completeSummaryResult, cragResult, profileResult] = await Promise.all([
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
  ])

  const completeSummary = (!completeSummaryResult.error && completeSummaryResult.data)
    ? completeSummaryResult.data as CompleteSummaryPayload
    : null

  const facesSource = Array.isArray(completeSummary?.faces) && completeSummary.faces.length > 0
    ? completeSummary.faces
    : Array.isArray(context.faces)
      ? context.faces
      : []

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
  const publicSubmitter = profileData?.is_public
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
    },
  }
}
