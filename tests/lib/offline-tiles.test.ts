import { describe, expect, test } from 'vitest'
import { buildOfflineTileUrl, buildTileManifestForPins } from '@/lib/offline/tiles'

describe('offline tile helpers', () => {
  test('builds layered offline tile urls', () => {
    expect(buildOfflineTileUrl(15, 1234, 5678, 'imagery')).toBe('/api/offline-tiles/imagery/15/1234/5678')
    expect(buildOfflineTileUrl(15, 1234, 5678, 'labels')).toBe('/api/offline-tiles/labels/15/1234/5678')
  })

  test('builds tile manifests with imagery by default', () => {
    const manifest = buildTileManifestForPins([{
      climbId: 'climb-1',
      climbName: 'Pin One',
      canonicalPath: '/gb/test-crag/i/image-1?climb=climb-1',
      coverImageUrl: null,
      latitude: 49.2,
      longitude: -2.1,
    }])

    expect(manifest).not.toBeNull()
    expect(manifest?.imageryTileUrls?.length).toBeGreaterThan(0)
    expect(manifest?.labelsTileUrls?.length).toBe(0)
    expect(manifest?.minZoom).toBe(14)
    expect(manifest?.maxZoom).toBe(17)
    expect(manifest?.tileCount).toBe((manifest?.imageryTileUrls?.length || 0) + (manifest?.labelsTileUrls?.length || 0))
    expect(manifest?.tileUrls.every((url) => url.startsWith('/api/offline-tiles/'))).toBe(true)
  })

  test('includes label tiles when explicitly requested', () => {
    const manifest = buildTileManifestForPins([{
      climbId: 'climb-1',
      climbName: 'Pin One',
      canonicalPath: '/gb/test-crag/i/image-1?climb=climb-1',
      coverImageUrl: null,
      latitude: 49.2,
      longitude: -2.1,
    }], { includeLabels: true })

    expect(manifest).not.toBeNull()
    expect(manifest?.imageryTileUrls?.length).toBeGreaterThan(0)
    expect(manifest?.labelsTileUrls?.length).toBeGreaterThan(0)
    expect(manifest?.tileCount).toBe((manifest?.imageryTileUrls?.length || 0) + (manifest?.labelsTileUrls?.length || 0))
  })

  test('keeps lower-zoom coverage bounded for a single saved pin', () => {
    const manifest = buildTileManifestForPins([{
      climbId: 'climb-1',
      climbName: 'Pin One',
      canonicalPath: '/gb/test-crag/i/image-1?climb=climb-1',
      coverImageUrl: null,
      latitude: 49.2,
      longitude: -2.1,
    }])

    expect(manifest).not.toBeNull()
    expect(manifest?.tileCount).toBeLessThanOrEqual(80)
  })
})
