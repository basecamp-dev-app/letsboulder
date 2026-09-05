import { describe, expect, test } from 'vitest'

import { GET as getFixtureMedia } from '@/app/images/[imageId]/[version]/[variant]/route'
import {
  createPhaseOneOfflineFixtureManifest,
  PHASE_ONE_FIXTURE_CRAG_ID,
  PHASE_ONE_FIXTURE_IMAGE_IDS,
} from '@/features/offline/server/phase-one-offline-fixture'

describe('phase one offline reliability fixture', () => {
  test('contains the mandatory deterministic crag relationships and metadata', () => {
    const fixture = createPhaseOneOfflineFixtureManifest()
    const textOnly = fixture.metadata.climbs.find((climb) => climb.name === 'No Photo Needed')
    const sharedImageLines = fixture.metadata.routeLines.filter((line) => line.imageId === PHASE_ONE_FIXTURE_IMAGE_IDS[0])
    const sharedClimbLines = fixture.metadata.routeLines.filter((line) => line.climbId === fixture.metadata.climbs[0]?.id)

    expect(fixture.cragId).toBe(PHASE_ONE_FIXTURE_CRAG_ID)
    expect(fixture.metadata.climbs).toHaveLength(3)
    expect(fixture.metadata.sectors).toHaveLength(2)
    expect(fixture.metadata.images).toHaveLength(2)
    expect(fixture.assets).toHaveLength(2)
    expect(fixture.schemaVersion).toBe(2)
    expect(fixture.exactTotalBytes).toBe(92)
    expect(fixture.assets.every((asset) => asset.byteCount === 46 && /^sha256:[a-f0-9]{64}$/.test(asset.digest))).toBe(true)
    expect(new Set(sharedImageLines.map((line) => line.climbId)).size).toBe(2)
    expect(new Set(sharedClimbLines.map((line) => line.imageId)).size).toBe(2)
    expect(fixture.metadata.routeLines[0]?.points).toEqual([
      { x: 0.2, y: 0.9 },
      { x: 0.4, y: 0.2 },
      { x: 0.6, y: 0.6 },
      { x: 0.8, y: 0.2 },
    ])
    expect(fixture.metadata.routeLines.some((line) => line.climbId === textOnly?.id)).toBe(false)
    expect(fixture.metadata.crag).toMatchObject({
      accessNotes: expect.stringContaining('harbour steps'),
      tideDependency: expect.stringContaining('Low tide'),
      coordinates: { latitude: 49.45012, longitude: -2.53987, visibility: 'exact' },
    })
  })

  test('serves stable immutable WebP responses at the packed-media boundary', async () => {
    const response = await getFixtureMedia(new Request('http://localhost/image'), {
      params: Promise.resolve({ imageId: PHASE_ONE_FIXTURE_IMAGE_IDS[0], version: 'v1', variant: 'topo.webp' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect((await response.arrayBuffer()).byteLength).toBe(46)
  })
})
