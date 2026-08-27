import { describe, expect, it } from 'vitest'

import { readOfflineCragPayload } from '@/features/offline/lib/offline-crag-reader'

function readableManifest() {
  return {
    type: 'crag', packId: 'crag:1', cragId: 'crag-1', cragName: 'The Crag',
    metadata: {
      crag: { name: 'The Crag' },
      climbs: [{ id: 'climb-1', grade: '6A', coordinates: { latitude: null, longitude: null } }],
      images: [{ id: 'image-1' }],
      routeLines: [{ id: 'line-1', climbId: 'climb-1', imageId: 'image-1' }],
    },
    assets: [{ imageId: 'image-1', variant: 'topo', url: 'https://example.com/topo.webp', width: 1200, height: 800 }],
  }
}

describe('offline crag reader compatibility', () => {
  it('reads current direct manifest payloads', () => {
    expect(readOfflineCragPayload(readableManifest())?.cragId).toBe('crag-1')
  })

  it('migrates the legacy child-pack wrapper at read time', () => {
    expect(readOfflineCragPayload({ manifest: readableManifest(), children: [{ type: 'climb' }] })?.cragName).toBe('The Crag')
    expect(readOfflineCragPayload({ manifest: { offline_pack: readableManifest() }, children: [] })?.cragName).toBe('The Crag')
  })

  it('rejects incomplete stored metadata', () => {
    expect(readOfflineCragPayload({ ...readableManifest(), metadata: { crag: {}, climbs: [], images: [], routeLines: [] } })).toBeNull()
  })
})
