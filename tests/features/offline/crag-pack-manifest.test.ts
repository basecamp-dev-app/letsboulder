import { describe, expect, it } from 'vitest'

import { buildCragPackManifest, type CragPackSource } from '@/features/offline/server/crag-pack-manifest'
import type { Database } from '@/types/database'

type CragRow = Database['public']['Tables']['crags']['Row']
type ClimbRow = Database['public']['Tables']['climbs']['Row']
type ImageRow = Database['public']['Tables']['images']['Row']
type RouteLineRow = Database['public']['Tables']['route_lines']['Row']
type SectorRow = Database['public']['Tables']['sectors']['Row']

const CRAG_ID = '00000000-0000-4000-8000-000000000001'
const HASH = 'a'.repeat(64)
const CANONICAL_BUCKET = 'private-media'

function crag(overrides: Partial<CragRow> = {}): CragRow {
  return {
    id: CRAG_ID, name: 'Test Crag', slug: 'test-crag', country_code: 'GB', country: 'United Kingdom',
    country_id: null, region_id: null, region_name: 'South', sub_area: 'Woods', rock_type: 'sandstone',
    type: 'boulder', tide_dependency: null, description: 'Description', access_notes: 'Access notes',
    latitude: 51.23456, longitude: -0.87654, location_visibility: 'approximate', updated_at: '2026-07-01',
    created_at: null, created_by: null, deleted_at: null, deletion_reason: null, image_count: null,
    is_flagged: null, last_edited_by: null, location: null, report_count: null, route_count: null,
    superseded_by: null, synced_at: null, content_origin: 'community', publication_notes: null,
    publication_status: 'published', published_at: '2026-07-01', published_by: null,
    readiness_version: 1, reviewed_at: null, reviewed_by: null, ...overrides,
  }
}

function climb(id: string, overrides: Partial<ClimbRow> = {}): ClimbRow {
  return {
    id, crag_id: CRAG_ID, sector_id: null, name: `Climb ${id}`, slug: `climb-${id}`, grade: '6A',
    consensus_grade: null, original_grade_string: null, route_type: 'boulder', description: null,
    is_verified: true, verification_count: 2, latitude: 51.2, longitude: -0.8, location_visibility: 'exact',
    updated_at: '2026-07-02', status: 'active', deleted_at: null, superseded_by: null, created_at: null,
    deletion_reason: null, grade_index: null, grade_tied: null, place_id: null, shared_climb_id: null,
    total_votes: null, user_id: null, ...overrides,
  }
}

function image(id: string, overrides: Partial<ImageRow> = {}): ImageRow {
  const base = {
    id, crag_id: CRAG_ID, capture_date: '2026-01-01', face_direction: 'N', face_directions: ['W', 'N'],
    face_order: 1, is_primary: true, width: 1600, height: 1200, latitude: 51.23, longitude: -0.87,
    processed_at: '2026-07-03', asset_version: 1, optimized_bucket: CANONICAL_BUCKET,
    optimized_key: `images/assets/${id}/${HASH}/canonical.webp`, optimized_mime: 'image/webp',
    optimized_bytes: 400_000, optimized_width: 2560, optimized_height: 1920,
    variants: {
      detail: { webp: { width: 1280, height: 960, contentType: 'image/webp', bytes: 123_456 } },
      topo: { webp: { width: 2048, height: 1536, contentType: 'image/webp' } },
    },
    processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved',
  }
  return { ...base, ...overrides } as ImageRow
}

function sector(id: string): SectorRow {
  return { id, crag_id: CRAG_ID, name: `Sector ${id}`, created_at: '2026-01-01' }
}

function line(id: string, climbId: string, imageId: string): RouteLineRow {
  return {
    id, climb_id: climbId, image_id: imageId, sequence_order: 1, color: '#fff', image_width: 100,
    image_height: 100, points: [{ x: 0.1, y: 0.2 }], created_at: null,
  }
}

function source(): CragPackSource {
  return {
    crag: crag(),
    climbs: [climb('b'), climb('a'), climb('deleted', { deleted_at: '2026-01-01' })],
    images: [image('image-b'), image('image-a', { crag_id: null }), image('private', { visibility: 'private' })],
    sectors: [sector('b'), sector('a')],
    routeLines: [line('b', 'b', 'image-b'), line('a', 'a', 'image-a'), line('private', 'a', 'private')],
  }
}

describe('crag pack manifest builder', () => {
  const assetFetcher = (async () => new Response('fixture-bytes', { headers: { 'content-type': 'image/webp' } })) as typeof fetch

  it('filters public content, applies coordinate policy, and emits immutable fixed-format assets', async () => {
    const result = await buildCragPackManifest(source(), 'https://static.example/', assetFetcher)

    expect(result?.canonicalPath).toBe('/gb/test-crag')
    expect(result?.metadata.crag.coordinates).toEqual({ latitude: 51.23, longitude: -0.88, visibility: 'approximate' })
    expect(result?.metadata.climbs.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(result?.metadata.climbs[0].coordinates).toEqual({ latitude: null, longitude: null, visibility: 'approximate' })
    expect(result?.metadata.images.map(({ id }) => id)).toEqual(['image-a', 'image-b'])
    expect(result?.metadata.images[0].coordinates).toEqual({ latitude: null, longitude: null, visibility: 'approximate' })
    expect(result?.metadata.routeLines.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(result?.assets[0]).toMatchObject({
      id: 'image-a:topo:webp', byteCount: 13, requirement: 'required',
      url: 'https://static.example/images/image-a/v1/topo.webp',
    })
    expect(result?.assets[1]).toMatchObject({ id: 'image-b:topo:webp', byteCount: 13 })
    expect(result?.exactTotalBytes).toBe(result?.assets.filter((asset) => asset.requirement === 'required').reduce((total, asset) => total + asset.byteCount, 0))
    expect(result?.assets.every((asset) => /^sha256:[a-f0-9]{64}$/.test(asset.digest))).toBe(true)
  })

  it('has deterministic content versions independent of input order and generatedAt', async () => {
    const firstSource = source()
    const secondSource = source()
    secondSource.climbs.reverse()
    secondSource.images.reverse()
    secondSource.routeLines.reverse()
    secondSource.sectors.reverse()
    const first = await buildCragPackManifest(firstSource, 'https://static.example', assetFetcher)
    const second = await buildCragPackManifest(secondSource, 'https://static.example', assetFetcher)

    expect(first?.contentVersion).toBe(second?.contentVersion)
    expect(first?.generatedAt).toBe(second?.generatedAt)
  })

  it('omits legacy, malformed, and private media and rejects inactive crags', async () => {
    const input = source()
    input.images = [
      image('legacy', { optimized_bucket: null, optimized_key: null, optimized_mime: null, optimized_bytes: null, optimized_width: null, optimized_height: null }),
      image('mismatch', { optimized_key: `images/assets/other/${HASH}/canonical.webp` }),
      image('incomplete', { optimized_bytes: null }),
      image('private', { visibility: 'private' }),
      image('pending', { moderation_status: 'pending' }),
    ]
    expect((await buildCragPackManifest(input, 'https://static.example', assetFetcher))?.assets).toEqual([])
    expect(await buildCragPackManifest({ ...input, crag: crag({ deleted_at: '2026-01-01' }) }, 'https://static.example', assetFetcher)).toBeNull()
  })
})
