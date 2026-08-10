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

  test('extracts crag child manifests for recursive validated loading', () => {
    const manifest = parseOfflinePackManifest({
      type: 'crag',
      schemaVersion: 1,
      minReaderVersion: 1,
      packId: 'crag:1',
      cragId: 'crag-1',
      cragName: 'The Glen',
      cragVersionHash: 'v1',
      manifestUrl: '/api/offline/crag-1',
      estimatedBytes: 500,
      climbs: [{ manifestUrl: '/api/offline/climb-1' }],
      metadata: { crag: {}, climbs: [], images: [], routeLines: [], sectors: [] },
      tileManifest: { tileUrls: ['/tiles/a.webp'] },
    }, 'https://letsboulder.com/api/offline/crag-1')

    expect(manifest.dependentManifestUrls).toEqual(['/api/offline/climb-1'])
    expect(manifest.assets[0]?.url).toBe('https://letsboulder.com/tiles/a.webp')
  })

  test('rejects malformed network payload fields', () => {
    expect(() => parseOfflinePackManifest({
      type: 'crag',
      schemaVersion: 1,
      minReaderVersion: 1,
      packId: 'crag:1',
      cragId: 'crag-1',
      cragName: 'Broken',
      cragVersionHash: 'v1',
      estimatedBytes: -1,
      mediaUrls: [42],
      climbs: [],
      metadata: { crag: {}, climbs: [], images: [], routeLines: [], sectors: [] },
    }, 'https://letsboulder.com/manifest')).toThrow(/estimatedBytes/)
  })
})
