import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { buildMediaProxyUrl, parsePrivateMediaRef } from '@/lib/media-proxy'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { serverEnv } from '@/lib/env.server'
import type { CompleteSummaryFace, CragRow, FaceRouteSummary, ImageInfoRow, ClimbInfo } from '@/lib/offline/build-climb-pack-types'
import type { OfflineMapPin } from '@/features/climb/lib/queries'

export function getFaceIdentityKey(face: Pick<CompleteSummaryFace, 'image_id' | 'linked_image_id' | 'crag_image_id' | 'index'>) {
  return face.image_id || face.linked_image_id || (face.crag_image_id ? `crag-image:${face.crag_image_id}` : `index:${face.index}`)
}

export function mergeFaceRoutes(existing: FaceRouteSummary[], incoming: FaceRouteSummary[]) {
  const byId = new Map<string, FaceRouteSummary>()
  for (const route of existing) byId.set(route.id, route)
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

export function mergeFaces(existing: CompleteSummaryFace | undefined, incoming: CompleteSummaryFace) {
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
    face_directions: incoming.face_directions && incoming.face_directions.length > 0 ? incoming.face_directions : existing.face_directions,
    metadata: incoming.metadata?.width || incoming.metadata?.height ? incoming.metadata : existing.metadata,
    routes: mergedRoutes,
    has_routes: existing.has_routes || incoming.has_routes || mergedRoutes.length > 0,
    ...(incomingRouteCount > existingRouteCount ? { url: incoming.url || existing.url } : {}),
  }
}

export function buildPrimaryFallbackFace(primaryImage: ImageInfoRow): CompleteSummaryFace {
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

export function getAdminClient() {
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) throw new Error('Supabase service role is not configured')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export const PUBLIC_OFFLINE_CLIMB_STATUSES = ['active', 'approved'] as const

export async function isPublicOfflineClimbVisible(
  supabase: ReturnType<typeof getAdminClient>,
  climbId: string
) {
  const { data, error } = await supabase
    .from('climbs')
    .select('id')
    .eq('id', climbId)
    .is('deleted_at', null)
    .in('status', [...PUBLIC_OFFLINE_CLIMB_STATUSES])
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.id)
}

export function hashValue(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

export function decorateMedia(rawUrl: string | null | undefined, versionSeed: string | null | undefined) {
  if (!rawUrl) {
    return { url: '', media_ref: null, cache_key: null, version: null }
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

export function resolveCanonicalPaths(crag: CragRow | null, climb: ClimbInfo | null, climbId: string) {
  const cragPath = crag?.country_code && crag?.slug ? `/${crag.country_code.toLowerCase()}/${crag.slug}` : (crag?.id ? `/crag/${crag.id}` : null)
  const climbPath = cragPath && climb?.slug ? `${cragPath}/${climb.slug}` : `/climb/${climbId}`
  return { cragPath, climbPath }
}

export function buildPrimaryPin(input: {
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
