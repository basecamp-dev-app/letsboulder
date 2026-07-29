import { describe, expect, test } from 'vitest'
import { parseOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'

describe('offline pack manifest validation', () => {
  test('normalizes a climb response and de-duplicates absolute asset URLs', () => {
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

    const manifest = parseOfflinePackManifest(payload, 'https://letsboulder.com/api/offline/climb-1')

    expect(manifest).toMatchObject({ packId: 'climb:1', kind: 'climb', entityId: 'climb-1', version: 'v2' })
    expect(manifest.assets.map((asset) => asset.url)).toEqual([
      'https://letsboulder.com/media/a.webp',
      'https://letsboulder.com/tiles/1.webp',
    ])
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
      packId: 'climb:1',
      climbId: 'climb-1',
      climbName: 'Broken',
      version: 'v1',
      estimatedBytes: -1,
      mediaUrls: [42],
    }, 'https://letsboulder.com/manifest')).toThrow(/estimatedBytes/)
  })
})
