import { describe, expect, test } from 'vitest'
import { parseOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'

describe('offline pack manifest validation', () => {
  test('rejects a standalone climb response', () => {
    const payload = {
      offline_pack: {
        packId: 'climb:1',
        climbId: 'climb-1',
        climbName: 'The Roof',
        version: 'v2',
        manifestUrl: '/api/offline/climb-1',
        estimatedBytes: 120,
        mediaUrls: ['/media/a.webp', '/media/a.webp'],
        tileUrls: ['/tiles/1.webp'],
      },
    }

    expect(() => parseOfflinePackManifest(payload, 'https://letsboulder.com/api/offline/climb-1')).toThrow('Only crag guides can be saved offline')
  })

  test('parses exact Pack v2 integrity and relationship metadata', () => {
    const manifest = parseOfflinePackManifest({
      type: 'crag',
      schemaVersion: 2,
      minReaderVersion: 2,
      packId: 'crag:1',
      cragId: 'crag-1',
      cragName: 'The Glen',
      cragVersionHash: 'v1',
      contentVersion: 'v1',
      generatedAt: '2026-09-01T00:00:00.000Z',
      canonicalPath: '/gb/the-glen',
      reader: { family: 'letsboulder-offline-field-guide', minimumVersion: 2 },
      manifestUrl: '/api/offline/crag-1',
      exactTotalBytes: 3,
      climbs: [{ climbId: 'climb-1', mediaUrls: [] }],
      requiredOfflineRoutes: ['/offline/crag?id=crag-1', '/offline/crag?id=crag-1&climb=climb-1'],
      metadata: { crag: { id: 'crag-1' }, climbs: [{ id: 'climb-1', sectorId: 'sector-1' }], images: [{ id: 'image-1' }], routeLines: [{ id: 'line-1', climbId: 'climb-1', imageId: 'image-1' }], sectors: [{ id: 'sector-1' }] },
      assets: [{ url: '/media/a.webp', contentKey: 'asset-a', byteCount: 3, mediaType: 'image/webp', digest: `sha256:${'a'.repeat(64)}`, requirement: 'required', owningImageId: 'image-1', owningClimbIds: ['climb-1'] }],
    }, 'https://letsboulder.com/api/offline/crag-1')

    expect(manifest.exactTotalBytes).toBe(3)
    expect(manifest.assets[0]?.url).toBe('https://letsboulder.com/media/a.webp')
  })

  test('rejects malformed network payload fields', () => {
    expect(() => parseOfflinePackManifest({
      type: 'crag',
      schemaVersion: 2,
      minReaderVersion: 2,
      packId: 'crag:1',
      cragId: 'crag-1',
      cragName: 'Broken',
      cragVersionHash: 'v1',
      contentVersion: 'v1',
      generatedAt: '2026-09-01T00:00:00.000Z',
      canonicalPath: '/gb/broken',
      reader: { family: 'letsboulder-offline-field-guide', minimumVersion: 2 },
      exactTotalBytes: -1,
      mediaUrls: [42],
      climbs: [],
      metadata: { crag: {}, climbs: [], images: [], routeLines: [], sectors: [] },
    }, 'https://letsboulder.com/manifest')).toThrow(/exactTotalBytes/)
  })
})
