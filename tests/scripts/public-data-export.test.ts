import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { createManifest, deterministicJson, loadConfig } from '@/scripts/public-data/export'
import { writeGeoJsonGzip, writeJsonlGzip } from '@/scripts/public-data/io'
import { cragToGeoJsonFeature, normalizeRouteLine, serializeViewRow } from '@/scripts/public-data/serialize'
const gunzipAsync = promisify(gunzip)
let tempDirectory: string | undefined

const crag = {
  id: 'crag-1',
  name: 'Hostile "name"\nnext line',
  slug: 'hostile-name',
  country_code: 'GB',
  country_id: null,
  country: 'United Kingdom',
  region_id: null,
  region_name: null,
  sub_area: null,
  rock_type: 'granite',
  type: 'boulder',
  tide_dependency: null,
  location_visibility: 'exact',
  latitude: 50.1,
  longitude: -1.2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  private_note: 'must not leak',
}

function routeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    climb_id: 'route-1',
    sequence_order: 1,
    color: '#fff',
    image_width: 1000,
    image_height: 500,
    points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }],
    created_at: null,
    raw_secret: 'must not leak',
    ...overrides,
  }
}

async function* values(...rows: unknown[]) {
  for (const row of rows) yield row
}

afterEach(async () => {
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
  tempDirectory = undefined
})

describe('public data serialization', () => {
  it('escapes hostile JSONL strings and only emits allowlisted keys', async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'public-export-'))
    const path = join(tempDirectory, 'crags.jsonl.gz')
    const metadata = await writeJsonlGzip(path, values(crag), (row) => serializeViewRow('crags', row))
    const compressed = await readFile(path)
    const text = (await gunzipAsync(compressed)).toString('utf8')

    expect(text.split('\n')).toHaveLength(2)
    expect(JSON.parse(text.trim())).toMatchObject({ name: crag.name })
    expect(text).not.toContain('private_note')
    expect(metadata).toEqual(expect.objectContaining({ rows: 1, bytes: compressed.length }))
    expect(metadata.sha256).toBe(createHash('sha256').update(compressed).digest('hex'))
  })

  it('classifies normalized points without emitting forbidden keys', () => {
    const output = normalizeRouteLine(routeLine())
    expect(output).toMatchObject({
      source_coordinate_system: 'normalized',
      points_normalized: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }],
    })
    expect(output).toHaveProperty('points')
    expect(output).not.toHaveProperty('raw_secret')
  })

  it('preserves ambiguous legacy coordinates without guessing a normalization', () => {
    expect(normalizeRouteLine(routeLine({
      points: [{ x: 100, y: 100 }, { x: 1000, y: 500 }],
    }))).toMatchObject({
      source_coordinate_system: 'legacy_image_space',
      points: [{ x: 100, y: 100 }, { x: 1000, y: 500 }],
      points_normalized: null,
    })
  })

  it.each([
    { points: [] },
    { points: [{ x: 0, y: 0 }] },
    { points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] },
  ])('rejects malformed points %#', ({ points }) => {
    expect(() => normalizeRouteLine(routeLine({ points }))).toThrow(/route_line/)
  })

  it('streams valid GeoJSON and omits crags with null coordinates', async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'public-export-'))
    const path = join(tempDirectory, 'crags.geojson.gz')
    const hidden = { ...crag, id: 'hidden', location_visibility: 'hidden', latitude: null, longitude: null }
    const metadata = await writeGeoJsonGzip(path, values(crag, hidden), cragToGeoJsonFeature)
    const collection = JSON.parse((await gunzipAsync(await readFile(path))).toString('utf8'))

    expect(collection).toMatchObject({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-1.2, 50.1] } }],
    })
    expect(metadata.rows).toBe(1)
  })
})

describe('public data manifest and configuration', () => {
  it('creates deterministic manifest JSON with required snapshot metadata', () => {
    const manifest = createManifest({
      generatedAt: '2026-07-29T02:30:00.000Z',
      exportDate: '2026-07-29',
      sourceRevision: 'abc123',
      runId: '20260729T023000000Z-abc123',
    }, [{
      path: 'crags.jsonl.gz',
      media_type: 'application/x-ndjson',
      compression: 'gzip',
      rows: 2,
      bytes: 100,
      sha256: 'a'.repeat(64),
    }])
    const first = deterministicJson(manifest)

    expect(first).toBe(deterministicJson(manifest))
    expect(first.endsWith('\n')).toBe(true)
    expect(manifest).toMatchObject({
      schema_version: '1.0.0', snapshot_type: 'full', run_id: '20260729T023000000Z-abc123', license: 'ODbL-1.0',
      coordinate_reference_system: 'EPSG:4326', coordinate_order: 'lon-lat',
    })
    expect(manifest.files[0].path).toBe('crags.jsonl.gz')
  })

  it('requires every secret and accepts an empty optional export date', () => {
    const env = {
      PUBLIC_DATA_EXPORT_DATABASE_URL: 'postgres://example',
      OPEN_DATA_R2_ENDPOINT: 'https://r2.example.com',
      OPEN_DATA_R2_BUCKET: 'open-data',
      OPEN_DATA_R2_ACCESS_KEY_ID: 'id',
      OPEN_DATA_R2_SECRET_ACCESS_KEY: 'secret',
      OPEN_DATA_PUBLIC_BASE_URL: 'https://data.example.com/',
      OPEN_DATA_MINISIGN_PRIVATE_KEY: 'untrusted comment\nsecret',
      OPEN_DATA_MINISIGN_PUBLIC_KEY: 'untrusted comment\npublic',
      EXPORT_DATE: '',
    }
    const config = loadConfig(env, new Date('2026-07-29T12:00:00Z'))
    expect(config).toMatchObject({ exportDate: '2026-07-29', publicBaseUrl: 'https://data.example.com' })
    expect(() => loadConfig({ ...env, OPEN_DATA_R2_BUCKET: '' })).toThrow('OPEN_DATA_R2_BUCKET is required')
  })
})
