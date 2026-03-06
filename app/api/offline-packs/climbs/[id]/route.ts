import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildMediaProxyUrl, estimateCompressedImageBytes, parsePrivateMediaRef } from '@/lib/media-proxy'

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
  crag_id: string | null
  primary_image_id: string
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
  route_type: string | null
  image_url: string
  coordinates: unknown
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

function decorateMedia(rawUrl: string | null | undefined, versionSeed: string | null | undefined) {
  if (!rawUrl) {
    return {
      url: '',
      media_ref: null,
      cache_key: null,
      version: null,
      estimatedBytes: 0,
    }
  }

  const parsed = parsePrivateMediaRef(rawUrl)
  if (!parsed) {
    return {
      url: rawUrl,
      media_ref: null,
      cache_key: rawUrl,
      version: versionSeed || rawUrl,
      estimatedBytes: 0,
    }
  }

  const version = versionSeed || `${parsed.bucket}:${parsed.path}`
  return {
    url: buildMediaProxyUrl(parsed.bucket, parsed.path, version),
    media_ref: rawUrl,
    cache_key: `${parsed.bucket}:${parsed.path}`,
    version,
    estimatedBytes: 0,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: climbId } = await params

  if (!climbId) {
    return NextResponse.json({ error: 'Climb ID is required' }, { status: 400 })
  }

  try {
    const supabase = getAdminClient()
    const { data: fullContext, error: fullContextError } = await supabase
      .rpc('get_climb_full_context', { p_climb_id: climbId })

    if (fullContextError) {
      throw fullContextError
    }

    const context = fullContext as FullContextPayload | null
    if (!context?.climb?.id) {
      return NextResponse.json({ error: 'Climb not found' }, { status: 404 })
    }

    if (!context.primary_image?.id) {
      const { data: legacyClimb, error: legacyError } = await supabase
        .from('climbs')
        .select('id, name, grade, route_type, image_url, coordinates')
        .eq('id', climbId)
        .single()

      if (legacyError) {
        throw legacyError
      }

      const legacy = legacyClimb as LegacyClimbRow
      const legacyMedia = decorateMedia(legacy.image_url, legacy.id)
      const estimatedBytes = estimateCompressedImageBytes(null, null)

      return NextResponse.json({
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
          crag_id: null,
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
          points: legacy.coordinates,
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
          metadata: {
            width: null,
            height: null,
          },
          routes: [],
          media_ref: legacyMedia.media_ref,
          cache_key: legacyMedia.cache_key,
          version: legacyMedia.version,
        }],
        summary: {
          total_faces: 1,
          total_routes: 1,
        },
        crag_path: null,
        public_submitter: null,
        offline_pack: {
          packId: `climb:${legacy.id}`,
          climbId: legacy.id,
          climbName: legacy.name,
          version: legacy.id,
          manifestUrl: `/api/offline-packs/climbs/${legacy.id}`,
          pageUrl: `/climb/${legacy.id}`,
          mediaUrls: [legacyMedia.url].filter(Boolean),
          mediaCount: 1,
          estimatedBytes,
        },
      })
    }

    const primaryImage = context.primary_image
    const [completeSummaryResult, cragResult, profileResult] = await Promise.all([
      supabase.rpc('get_crag_faces_complete_summary', { p_image_id: primaryImage.id }),
      primaryImage.crag_id
        ? supabase.from('crags').select('id, country_code, slug').eq('id', primaryImage.crag_id).maybeSingle()
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

    const decoratedPrimary = decorateMedia(primaryImage.url, primaryImage.id)

    const facesSource = Array.isArray(completeSummary?.faces) && completeSummary.faces.length > 0
      ? completeSummary.faces
      : Array.isArray(context.faces)
        ? context.faces
        : []

    let estimatedBytes = estimateCompressedImageBytes(primaryImage.natural_width || primaryImage.width, primaryImage.natural_height || primaryImage.height)

    const faces = facesSource
      .map((face) => {
        if (!face?.url) return null
        const versionSeed = face.image_id || face.linked_image_id || face.crag_image_id || String(face.index ?? 0)
        const decorated = decorateMedia(face.url, versionSeed)
        const width = face.metadata?.width ?? null
        const height = face.metadata?.height ?? null
        estimatedBytes += estimateCompressedImageBytes(width, height)

        return {
          id: face.is_primary
            ? `image:${primaryImage.id}`
            : `crag-image:${face.crag_image_id || face.index}`,
          index: face.index,
          image_id: face.image_id,
          is_primary: face.is_primary,
          url: decorated.url,
          has_routes: face.has_routes || (Array.isArray(face.routes) && face.routes.length > 0),
          linked_image_id: face.linked_image_id === primaryImage.id ? null : face.linked_image_id,
          crag_image_id: face.crag_image_id,
          face_directions: Array.isArray(face.face_directions) ? face.face_directions : null,
          metadata: {
            width,
            height,
          },
          routes: Array.isArray(face.routes) ? face.routes : [],
          media_ref: decorated.media_ref,
          cache_key: decorated.cache_key,
          version: decorated.version,
        }
      })
      .filter((face): face is NonNullable<typeof face> => face !== null)

    const cragData = 'data' in cragResult ? cragResult.data : null
    const cragPath = primaryImage.crag_id
      ? (cragData?.country_code && cragData?.slug
          ? `/${cragData.country_code.toLowerCase()}/${cragData.slug}`
          : `/crag/${primaryImage.crag_id}`)
      : null

    const profileData = 'data' in profileResult ? profileResult.data : null
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

    const mediaUrls = Array.from(new Set([
      decoratedPrimary.url,
      ...faces.map((face) => face.url),
    ].filter(Boolean)))

    return NextResponse.json({
      climb: context.climb,
      primary_image: {
        ...primaryImage,
        url: decoratedPrimary.url,
        media_ref: decoratedPrimary.media_ref,
        cache_key: decoratedPrimary.cache_key,
        version: decoratedPrimary.version,
      },
      primary_route_lines: Array.isArray(context.primary_route_lines) ? context.primary_route_lines : [],
      faces,
      summary: completeSummary?.summary || context.summary || {
        total_faces: Math.max(1, faces.length),
        total_routes: Array.isArray(context.primary_route_lines) ? context.primary_route_lines.length : 0,
      },
      crag_path: cragPath,
      public_submitter: publicSubmitter,
      offline_pack: {
        packId: `climb:${climbId}`,
        climbId,
        climbName: context.climb.name,
        version: `${climbId}:${primaryImage.id}:${faces.length}`,
        manifestUrl: `/api/offline-packs/climbs/${climbId}`,
        pageUrl: `/climb/${climbId}`,
        mediaUrls,
        mediaCount: mediaUrls.length,
        estimatedBytes,
      },
    })
  } catch (error) {
    console.error('Offline climb pack route error:', error)
    return NextResponse.json({ error: 'Failed to load climb pack' }, { status: 500 })
  }
}
