import { createHash } from 'node:crypto'

import { serverEnv } from '@/lib/env.server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import type { Database, Json } from '@/types/database'
import {
  CRAG_PACK_MIN_READER_VERSION,
  CRAG_PACK_SCHEMA_VERSION,
  type CragPackAsset,
  type CragPackCoordinates,
  type CragPackManifest,
  type CragPackManifestSnapshot,
} from '@/types/crag-pack-manifest'
import {
  createPhaseOneOfflineFixtureManifest,
  PHASE_ONE_FIXTURE_CRAG_ID,
} from '@/features/offline/server/phase-one-offline-fixture'

type CragRow = Database['public']['Tables']['crags']['Row']
type ClimbRow = Database['public']['Tables']['climbs']['Row']
type ImageRow = Database['public']['Tables']['images']['Row']
type RouteLineRow = Database['public']['Tables']['route_lines']['Row']
type SectorRow = Database['public']['Tables']['sectors']['Row']

export interface CragPackSource {
  crag: CragRow
  climbs: ClimbRow[]
  images: ImageRow[]
  routeLines: RouteLineRow[]
  sectors: SectorRow[]
}

// Typing these narrow runtime projections as `*` avoids PostgREST's recursive
// select parser limit while retaining generated row types and explicit columns.
const CRAG_SELECT = 'id, name, slug, country_code, country, region_name, sub_area, rock_type, type, tide_dependency, description, access_notes, latitude, longitude, location_visibility, updated_at, deleted_at, superseded_by' as '*'
const CLIMB_SELECT = 'id, crag_id, sector_id, name, slug, grade, consensus_grade, original_grade_string, route_type, description, is_verified, verification_count, latitude, longitude, location_visibility, updated_at, status, deleted_at, superseded_by' as '*'
const IMAGE_SELECT = 'id, crag_id, capture_date, face_direction, face_directions, face_order, is_primary, width, height, latitude, longitude, processed_at, asset_version, optimized_bucket, optimized_key, optimized_mime, optimized_bytes, optimized_width, optimized_height, variants, processing_status, moderation_status, visibility, status' as '*'
const ROUTE_LINE_SELECT = 'id, climb_id, image_id, sequence_order, color, image_width, image_height, points' as '*'
const SECTOR_SELECT = 'id, crag_id, name' as '*'
const PAGE_SIZE = 1_000
const ID_CHUNK_SIZE = 100

async function loadPaged<T>(loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function loadChunked<T>(ids: string[], loadIds: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
    rows.push(...await loadIds(ids.slice(index, index + ID_CHUNK_SIZE)))
  }
  return rows
}

function compareIds(left: { id: string }, right: { id: string }) {
  return left.id.localeCompare(right.id)
}

function coordinates(
  latitude: number | null,
  longitude: number | null,
  visibility: CragPackCoordinates['visibility'],
  approximateAllowed: boolean,
): CragPackCoordinates {
  if (visibility === 'exact') return { latitude, longitude, visibility }
  if (visibility === 'approximate' && approximateAllowed) {
    return {
      latitude: latitude === null ? null : Math.round(latitude * 100) / 100,
      longitude: longitude === null ? null : Math.round(longitude * 100) / 100,
      visibility,
    }
  }
  return { latitude: null, longitude: null, visibility }
}

function routeVisibility(crag: CragRow, climb: ClimbRow): CragPackCoordinates['visibility'] {
  if (crag.location_visibility === 'hidden' || climb.location_visibility === 'hidden') return 'hidden'
  if (crag.location_visibility === 'approximate' || climb.location_visibility === 'approximate') return 'approximate'
  return 'exact'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function variantMetadata(image: ImageRow, variant: 'detail' | 'topo') {
  if (!isRecord(image.variants) || !isRecord(image.variants[variant]) || !isRecord(image.variants[variant].webp)) return null
  const metadata = image.variants[variant].webp
  const width = positiveInteger(metadata.width)
  const height = positiveInteger(metadata.height)
  if (width === null || height === null) return null
  const storedBytes = positiveInteger(metadata.bytes) ?? positiveInteger(metadata.byteSize) ?? positiveInteger(metadata.contentLength)
  return { width, height, storedBytes }
}

function canonicalOptimizedMetadata(image: ImageRow) {
  const bytes = positiveInteger(image.optimized_bytes)
  const width = positiveInteger(image.optimized_width)
  const height = positiveInteger(image.optimized_height)
  if (!image.optimized_bucket?.trim() || !image.optimized_key || image.optimized_mime !== 'image/webp'
    || bytes === null || width === null || height === null) return null

  const keyPattern = new RegExp(`^images/assets/${image.id}/[a-f0-9]{64}/canonical\\.webp$`, 'i')
  if (!keyPattern.test(image.optimized_key)) return null
  return { bytes, width, height }
}

function estimatedBytes(canonical: { bytes: number; width: number; height: number }, width: number, height: number, storedBytes: number | null): number {
  if (storedBytes !== null) return storedBytes
  const ratio = Math.min(1, (width * height) / (canonical.width * canonical.height))
  return Math.max(1, Math.round(canonical.bytes * ratio))
}

function imageAssets(image: ImageRow, cdnBaseUrl: string): CragPackAsset[] {
  const canonical = canonicalOptimizedMetadata(image)
  if (!canonical) return []
  return (['detail', 'topo'] as const).flatMap((variant) => {
    const metadata = variantMetadata(image, variant)
    if (!metadata) return []
    const bytes = estimatedBytes(canonical, metadata.width, metadata.height, metadata.storedBytes)
    return [{
      id: `${image.id}:${variant}:webp`,
      imageId: image.id,
      variant,
      format: 'webp' as const,
      mediaType: 'image/webp' as const,
      url: `${cdnBaseUrl}/images/${encodeURIComponent(image.id)}/v${image.asset_version}/${variant}.webp`,
      width: metadata.width,
      height: metadata.height,
      estimatedBytes: bytes,
    }]
  })
}

function isEligibleImage(image: ImageRow, cragId: string, routeImageIds: Set<string>) {
  return (image.crag_id === cragId || routeImageIds.has(image.id)) && image.processing_status === 'ready'
    && (image.moderation_status === 'approved' || image.moderation_status === 'skipped')
    && image.visibility === 'public' && image.status === 'approved'
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = canonicalize(value[key])
    return result
  }, {})
}

export function buildCragPackManifest(
  source: CragPackSource,
  cdnBaseUrl: string,
): CragPackManifest | null {
  const { crag } = source
  if (crag.deleted_at !== null || crag.superseded_by !== null || !crag.slug?.trim() || !crag.country_code?.trim()) return null

  const climbs = source.climbs
    .filter((climb) => climb.crag_id === crag.id && climb.deleted_at === null && climb.superseded_by === null
      && (climb.status === 'active' || climb.status === 'approved'))
    .sort(compareIds)
  const climbIds = new Set(climbs.map((climb) => climb.id))
  const routeImageIds = new Set(source.routeLines
    .filter((line) => climbIds.has(line.climb_id))
    .map((line) => line.image_id))
  const images = source.images.filter((image) => isEligibleImage(image, crag.id, routeImageIds)).sort(compareIds)
  const imageIds = new Set(images.map((image) => image.id))
  const sectors = source.sectors.filter((sector) => sector.crag_id === crag.id).sort(compareIds)
  const cragCoordinates = coordinates(crag.latitude, crag.longitude, crag.location_visibility, true)
  const parsedCdnUrl = new URL(cdnBaseUrl)
  if (parsedCdnUrl.protocol !== 'https:') throw new Error('HTTPS media CDN URL is required')
  const normalizedCdnUrl = cdnBaseUrl.replace(/\/+$/, '')

  const snapshot: CragPackManifestSnapshot = {
    schemaVersion: CRAG_PACK_SCHEMA_VERSION,
    minReaderVersion: CRAG_PACK_MIN_READER_VERSION,
    canonicalPath: `/${crag.country_code.toLowerCase()}/${crag.slug}`,
    metadata: {
      crag: {
        id: crag.id, name: crag.name, slug: crag.slug, countryCode: crag.country_code.toUpperCase(),
        country: crag.country, regionName: crag.region_name, subArea: crag.sub_area, rockType: crag.rock_type,
        type: crag.type, tideDependency: crag.tide_dependency, description: crag.description,
        accessNotes: crag.access_notes, coordinates: cragCoordinates, updatedAt: crag.updated_at,
      },
      sectors: sectors.map((sector) => ({ id: sector.id, name: sector.name })),
      climbs: climbs.map((climb) => {
        const visibility = routeVisibility(crag, climb)
        return {
          id: climb.id, sectorId: climb.sector_id, name: climb.name, slug: climb.slug, grade: climb.grade,
          consensusGrade: climb.consensus_grade, originalGrade: climb.original_grade_string,
          routeType: climb.route_type, description: climb.description, isVerified: climb.is_verified === true,
          verificationCount: climb.verification_count ?? 0,
          coordinates: coordinates(climb.latitude, climb.longitude, visibility, false), updatedAt: climb.updated_at,
        }
      }),
      images: images.map((image) => ({
        id: image.id, captureDate: image.capture_date, faceDirection: image.face_direction,
        faceDirections: [...(image.face_directions ?? [])].sort(), faceOrder: image.face_order,
        isPrimary: image.is_primary, width: image.width, height: image.height,
        coordinates: coordinates(image.latitude, image.longitude, crag.location_visibility, false),
        processedAt: image.processed_at, assetVersion: image.asset_version,
      })),
      routeLines: source.routeLines
        .filter((line) => climbIds.has(line.climb_id) && imageIds.has(line.image_id))
        .sort(compareIds)
        .map((line) => ({
          id: line.id, climbId: line.climb_id, imageId: line.image_id, sequenceOrder: line.sequence_order,
          color: line.color, imageWidth: line.image_width, imageHeight: line.image_height, points: line.points as Json,
        })),
    },
    assets: images.flatMap((image) => imageAssets(image, normalizedCdnUrl)).sort(compareIds),
  }
  const contentVersion = createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex')
  const mediaUrls = snapshot.assets.map((asset) => asset.url)
  const generatedAt = [crag.updated_at, ...climbs.map((climb) => climb.updated_at), ...images.map((image) => image.processed_at)]
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1) ?? '1970-01-01T00:00:00.000Z'
  return {
    ...snapshot,
    type: 'crag',
    packId: `crag:${crag.id}`,
    cragId: crag.id,
    cragName: crag.name,
    cragVersionHash: contentVersion,
    estimatedBytes: snapshot.assets.reduce((total, asset) => total + (asset.estimatedBytes ?? 0), 0),
    mediaUrls,
    climbs: snapshot.metadata.climbs.map((climb) => ({ climbId: climb.id, mediaUrls: [] })),
    contentVersion,
    generatedAt,
  }
}

export async function loadCragPackManifest(cragId: string): Promise<CragPackManifest | null> {
  if (cragId === PHASE_ONE_FIXTURE_CRAG_ID) return createPhaseOneOfflineFixtureManifest()
  const cdnBaseUrl = serverEnv.NEXT_PUBLIC_MEDIA_CDN_URL
  if (!cdnBaseUrl || new URL(cdnBaseUrl).protocol !== 'https:') throw new Error('HTTPS media CDN URL is required')
  const supabase = getUnauthenticatedClient()
  const { data: crag, error: cragError } = await supabase.from('crags').select(CRAG_SELECT)
    .eq('id', cragId).is('deleted_at', null).is('superseded_by', null).maybeSingle()
  if (cragError) throw cragError
  if (!crag) return null

  const [climbs, cragImages, sectors] = await Promise.all([
    loadPaged<ClimbRow>(async (from, to) => supabase.from('climbs').select(CLIMB_SELECT).eq('crag_id', cragId)
      .is('deleted_at', null).is('superseded_by', null).in('status', ['active', 'approved']).order('id').range(from, to)),
    loadPaged<ImageRow>(async (from, to) => supabase.from('images').select(IMAGE_SELECT).eq('crag_id', cragId)
      .eq('processing_status', 'ready').in('moderation_status', ['approved', 'skipped'])
      .eq('visibility', 'public').eq('status', 'approved').order('id').range(from, to)),
    loadPaged<SectorRow>(async (from, to) => supabase.from('sectors').select(SECTOR_SELECT).eq('crag_id', cragId)
      .order('id').range(from, to)),
  ])

  const climbIds = climbs.map((climb) => climb.id)
  const routeLines = await loadChunked(climbIds, (ids) => loadPaged<RouteLineRow>(async (from, to) => supabase
    .from('route_lines').select(ROUTE_LINE_SELECT).in('climb_id', ids).order('id').range(from, to)))
  const routeImageIds = [...new Set(routeLines.map((line) => line.image_id))]
  const routeImages = await loadChunked(routeImageIds, (ids) => loadPaged<ImageRow>(async (from, to) => supabase
    .from('images').select(IMAGE_SELECT).in('id', ids).eq('processing_status', 'ready')
    .in('moderation_status', ['approved', 'skipped']).eq('visibility', 'public').eq('status', 'approved')
    .order('id').range(from, to)))
  const parentCragIds = [...new Set(routeImages.flatMap((image) => image.crag_id && image.crag_id !== cragId ? [image.crag_id] : []))]
  const activeParentCrags = new Set((await loadChunked(parentCragIds, (ids) => loadPaged<{ id: string }>(async (from, to) => supabase
    .from('crags').select('id').in('id', ids).is('deleted_at', null).is('superseded_by', null).order('id').range(from, to))))
    .map((parent) => parent.id))
  const eligibleRouteImages = routeImages.filter((image) => image.crag_id === null || image.crag_id === cragId || activeParentCrags.has(image.crag_id))
  const images = [...new Map([...cragImages, ...eligibleRouteImages].map((image) => [image.id, image])).values()]

  return buildCragPackManifest({
    crag,
    climbs,
    images,
    sectors,
    routeLines,
  }, cdnBaseUrl)
}
