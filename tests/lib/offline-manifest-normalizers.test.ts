import { describe, expect, test } from 'vitest'
import { normalizeClimbManifest, normalizeCragManifest } from '@/lib/offline/manifest-normalizers'

describe('offline manifest normalizers', () => {
  test('prefers canonical climb path as offline launch url when missing', () => {
    const manifest = normalizeClimbManifest({
      packId: 'climb:1',
      type: 'climb',
      climbId: '1',
      climbName: 'Test Climb',
      version: 'v1',
      manifestUrl: '/api/offline-packs/climbs/1',
      pageUrl: '/climb/1',
      canonicalPath: '/gb/test-crag/test-climb',
      mediaUrls: [],
      mediaCount: 0,
      estimatedBytes: 0,
    })

    expect(manifest.offlineLaunchUrl).toBe('/gb/test-crag/test-climb')
  })

  test('prefers canonical crag path as offline launch url when missing', () => {
    const manifest = normalizeCragManifest({
      packId: 'crag:1',
      type: 'crag',
      cragId: '1',
      cragName: 'Test Crag',
      canonicalPath: '/gb/test-crag',
      manifestUrl: '/api/offline-packs/crags/1',
      cragVersionHash: 'hash-1',
      estimatedBytes: 0,
      climbCount: 0,
      mediaCount: 0,
      climbs: [],
      removedClimbIds: [],
    })

    expect(manifest.offlineLaunchUrl).toBe('/gb/test-crag')
  })
})
