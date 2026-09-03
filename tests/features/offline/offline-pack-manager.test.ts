import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { OfflineMediaCache } from '@/features/offline/lib/offline-pack-cache'
import { OfflinePackManager, type OfflinePackRepository } from '@/features/offline/lib/offline-pack-manager'
import type { ActiveOfflinePack, OfflineAssetOwnershipRecord, OfflineDownloadJobRecord, OfflinePackManifest, OfflinePackRecord } from '@/features/offline/lib/offline-pack-types'

const lockRequest = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback())
const assetUrl = 'https://example.com/a.webp'
const sharedUrl = 'https://example.com/shared.webp'
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}` as `sha256:${string}`

function response(version = 'v2', minReaderVersion = 2): Response {
  const assets = [
    { id: 'image-a:topo:webp', imageId: 'image-a', owningImageId: 'image-a', owningClimbIds: ['climb-a'], url: assetUrl, contentKey: `a-${version}`, byteCount: 1, digest: digest('a'), requirement: 'required', mediaType: 'image/webp', variant: 'topo', format: 'webp', width: 1, height: 1 },
    { id: 'image-shared:topo:webp', imageId: 'image-shared', owningImageId: 'image-shared', owningClimbIds: ['climb-a'], url: sharedUrl, contentKey: 'shared', byteCount: 1, digest: digest('s'), requirement: 'required', mediaType: 'image/webp', variant: 'topo', format: 'webp', width: 1, height: 1 },
  ]
  return new Response(JSON.stringify({
    type: 'crag', schemaVersion: 2, minReaderVersion, packId: 'crag:1', cragId: 'crag-1', cragName: 'The Crag',
    cragVersionHash: version, contentVersion: version, exactTotalBytes: 2, estimatedBytes: 2,
    requiredOfflineRoutes: ['/offline/crag?id=crag-1', '/offline/crag?id=crag-1&climb=climb-a'],
    canonicalPath: '/gb/the-crag', generatedAt: '2026-09-01T00:00:00.000Z',
    reader: { family: 'letsboulder-offline-field-guide', minimumVersion: 2 }, climbs: [{ climbId: 'climb-a', mediaUrls: [] }], mediaUrls: assets.map((asset) => asset.url),
    metadata: { crag: { id: 'crag-1', name: 'The Crag', coordinates: { latitude: null, longitude: null } }, climbs: [{ id: 'climb-a', grade: '6A', sectorId: null, coordinates: { latitude: null, longitude: null } }], images: [{ id: 'image-a' }, { id: 'image-shared' }], routeLines: [{ id: 'line-a', climbId: 'climb-a', imageId: 'image-a' }, { id: 'line-shared', climbId: 'climb-a', imageId: 'image-shared' }], sectors: [] },
    assets,
  }), { headers: { 'content-type': 'application/json' } })
}

function createHarness(options: { failDownload?: boolean; existing?: Map<string, { bytes: number; digest: `sha256:${string}` }> } = {}) {
  let manifest: OfflinePackManifest | null = null
  let active: ActiveOfflinePack | null = null
  let assets: OfflineAssetOwnershipRecord[] = []
  let job: OfflineDownloadJobRecord | null = null
  const cached = options.existing ?? new Map<string, { bytes: number; digest: `sha256:${string}` }>()
  const events: string[] = []
  const repository: OfflinePackRepository = {
    listPacks: vi.fn(async () => active ? [active.pack] : []), getPack: vi.fn(async () => active?.pack ?? null), getActivePack: vi.fn(async () => active),
    stage: vi.fn(async (next: OfflinePackManifest, now: string) => {
      manifest = next
      assets = next.assets.map((asset) => ({ id: `${next.version}:${asset.url}`, versionId: `crag:1:${next.version}`, packId: next.packId, version: next.version, ...asset, state: 'pending', downloadedBytes: 0, verifiedDigest: null }))
      job = { id: `crag:1:${next.version}`, packId: next.packId, version: next.version, versionId: `crag:1:${next.version}`, state: 'queued', completedAssets: 0, totalAssets: assets.length, downloadedBytes: 0, error: null, updatedAt: now }
      events.push('stage'); return job
    }),
    getVersion: vi.fn(async () => manifest ? { manifest } : null), listJobs: vi.fn(async () => job ? [job] : []), listVersionAssets: vi.fn(async () => assets),
    checkpointAsset: vi.fn(async (_id, url, bytes, verifiedDigest) => {
      const asset = assets.find((candidate) => candidate.url === url)
      if (!asset || bytes !== asset.byteCount || verifiedDigest !== asset.digest) throw new Error('bad checkpoint')
      asset.state = 'verified'; asset.downloadedBytes = bytes; asset.verifiedDigest = verifiedDigest
      if (job) job.completedAssets += 1
      events.push(`checkpoint:${url}`)
    }),
    failJob: vi.fn(async () => { events.push('failed') }),
    activate: vi.fn(async () => {
      if (!manifest || assets.some((asset) => asset.state !== 'verified')) throw new Error('incomplete')
      const pack: OfflinePackRecord = { packId: manifest.packId, kind: 'crag', entityId: manifest.entityId, displayName: manifest.displayName, manifestUrl: manifest.manifestUrl, activeVersion: manifest.version, status: 'verified', installedAt: 'now', updatedAt: 'now', error: null }
      active = { pack, version: { id: `crag:1:${manifest.version}`, packId: manifest.packId, version: manifest.version, manifest, state: 'active', createdAt: 'now', verifiedAt: 'now', activatedAt: 'now', openedAt: null } }
      events.push('activate'); return 'crag:1:v1'
    }),
    removeVersion: vi.fn(async () => [sharedUrl]), discardFailedVersion: vi.fn(async () => [assetUrl]), removePack: vi.fn(async () => []),
    isAssetOwned: vi.fn(async (url) => url === sharedUrl), markAssetCached: vi.fn(async () => undefined), setPackHealth: vi.fn(async () => undefined), cleanOrphanRecords: vi.fn(async () => []),
    markOpened: vi.fn(async () => [assetUrl]), listLegacyPacks: vi.fn(async () => []), getMigration: vi.fn(async () => null), setMigration: vi.fn(async () => undefined),
  }
  const cache: OfflineMediaCache = {
    has: vi.fn(async (url) => cached.has(url)),
    verify: vi.fn(async (url, _media, bytes, expectedDigest) => {
      const value = cached.get(url)
      if (!value) throw new Error(`Required cached asset is missing: ${url}`)
      if (value.bytes !== bytes) throw new Error(`Asset response byte count does not match: ${url}`)
      if (value.digest !== expectedDigest) throw new Error(`Asset response digest does not match: ${url}`)
      return { byteCount: value.bytes, digest: value.digest, mediaType: 'image/webp' }
    }),
    download: vi.fn(async (url, _fetcher, _media, bytes, expectedDigest) => {
      if (options.failDownload) throw new Error('network interrupted')
      cached.set(url, { bytes: bytes as number, digest: expectedDigest as `sha256:${string}` })
      events.push(`download:${url}`); return bytes as number
    }),
    remove: vi.fn(async (url) => { cached.delete(url); events.push(`remove:${url}`) }), keys: vi.fn(async () => [...cached.keys()]),
  }
  const fetcher = vi.fn(async () => response()) as unknown as typeof fetch
  return { manager: new OfflinePackManager({ repository, cache, fetcher, now: () => 'now' }), repository, cache, fetcher, events, cached }
}

describe('offline pack manager v2 integrity', () => {
  beforeEach(() => vi.stubGlobal('navigator', { locks: { request: lockRequest } }))

  test('verifies every required asset before atomic activation and retains the previous version', async () => {
    const { manager, repository, events } = createHarness()
    expect((await manager.install('https://example.com/manifest')).active.pack.status).toBe('verified')
    expect(events.filter((event) => event.startsWith('checkpoint:'))).toHaveLength(2)
    expect(events.indexOf('stage')).toBeLessThan(events.indexOf('activate'))
    expect(repository.removeVersion).not.toHaveBeenCalled()
  })

  test.each(['digest', 'byte count'])('%s mismatch prevents first activation', async (kind) => {
    const existing = new Map([[assetUrl, { bytes: kind === 'byte count' ? 2 : 1, digest: kind === 'digest' ? digest('wrong') : digest('a') }]])
    const harness = createHarness({ existing, failDownload: true })
    await expect(harness.manager.install('https://example.com/manifest')).rejects.toThrow('network interrupted')
    expect(harness.repository.activate).not.toHaveBeenCalled()
  })

  test('quota exhaustion prevents staging and activation', async () => {
    vi.stubGlobal('navigator', { locks: { request: lockRequest }, storage: { estimate: vi.fn(async () => ({ quota: 1, usage: 0 })), persisted: vi.fn(async () => true) } })
    const { manager, repository } = createHarness()
    await expect(manager.install('https://example.com/manifest')).rejects.toThrow('Storage quota is too small')
    expect(repository.stage).not.toHaveBeenCalled()
  })

  test('failed update preserves the active verified version', async () => {
    const harness = createHarness()
    await harness.manager.install('https://example.com/manifest')
    vi.mocked(harness.fetcher).mockResolvedValue(response('v3'))
    vi.mocked(harness.cache.download).mockRejectedValueOnce(new Error('network interrupted'))
    harness.cached.delete(assetUrl)
    await expect(harness.manager.update('crag:1')).rejects.toThrow('network interrupted')
    expect((await harness.repository.getActivePack('crag:1'))?.pack.activeVersion).toBe('v2')
  })

  test('an incompatible reader never stages or replaces a compatible version', async () => {
    const harness = createHarness()
    vi.mocked(harness.fetcher).mockResolvedValue(response('future', 3))
    await expect(harness.manager.install('https://example.com/manifest')).rejects.toThrow('newer reader')
    expect(harness.repository.stage).not.toHaveBeenCalled()
  })

  test('repair revalidates bytes and digests instead of checking cache presence', async () => {
    const harness = createHarness()
    await harness.manager.install('https://example.com/manifest')
    harness.cached.set(assetUrl, { bytes: 1, digest: digest('wrong') })
    await harness.manager.repair('crag:1')
    expect(harness.cache.verify).toHaveBeenCalledWith(assetUrl, 'image/webp', 1, digest('a'))
    expect(harness.cache.download).toHaveBeenCalledWith(assetUrl, expect.anything(), 'image/webp', 1, digest('a'))
  })

  test('first successful open releases only unowned retained assets', async () => {
    const harness = createHarness()
    await harness.manager.install('https://example.com/manifest')
    vi.mocked(harness.cache.remove).mockClear()
    await harness.manager.markOpened('crag:1')
    expect(harness.cache.remove).toHaveBeenCalledWith(assetUrl)
    expect(harness.cache.remove).not.toHaveBeenCalledWith(sharedUrl)
  })

  test('a verified migration open advances monotonically despite concurrent activation bookkeeping', async () => {
    const harness = createHarness()
    await harness.manager.install('https://example.com/manifest')
    vi.mocked(harness.repository.getMigration!).mockResolvedValue({
      id: 'crag:1', packId: 'crag:1', legacyVersionId: 'crag:1:v1',
      targetVersionId: 'crag:1:v2', state: 'verified', error: null, updatedAt: 'now',
    })

    await harness.manager.markOpened('crag:1')

    expect(harness.repository.setMigration).toHaveBeenCalledWith(expect.objectContaining({ state: 'opened', targetVersionId: 'crag:1:v2' }))
  })

  test('legacy migration is recorded and leaves legacy input untouched', async () => {
    const harness = createHarness()
    vi.mocked(harness.repository.listLegacyPacks!).mockResolvedValue([{ packId: 'crag:1', kind: 'crag', entityId: 'crag-1', displayName: 'Legacy', manifestUrl: 'https://example.com/manifest', activeVersion: 'v1', status: 'needs-repair', installedAt: 'old', updatedAt: 'old', error: null }])
    await harness.manager.migrateLegacyPacks()
    expect(harness.repository.setMigration).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'activated', legacyVersionId: 'crag:1:v1' }))
    expect(harness.repository.removeVersion).not.toHaveBeenCalled()
  })
})
