import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { OfflineMediaCache } from '@/features/offline/lib/offline-pack-cache'
import { OfflinePackManager, type OfflinePackRepository } from '@/features/offline/lib/offline-pack-manager'
import type {
  ActiveOfflinePack,
  OfflineAssetOwnershipRecord,
  OfflineDownloadJobRecord,
  OfflinePackManifest,
  OfflinePackRecord,
} from '@/features/offline/lib/offline-pack-types'

const lockRequest = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback())
vi.stubGlobal('navigator', { locks: { request: lockRequest } })

function manifestResponse(): Response {
  return new Response(JSON.stringify({
    offline_pack: {
       type: 'crag',
       schemaVersion: 1,
       minReaderVersion: 1,
       packId: 'crag:1',
       cragId: 'crag-1',
       cragName: 'The Crag',
       cragVersionHash: 'v2',
      manifestUrl: 'https://example.com/manifest',
      estimatedBytes: 100,
       mediaUrls: ['https://example.com/a.webp', 'https://example.com/shared.webp'],
       climbs: [],
       metadata: { crag: {}, climbs: [], images: [], routeLines: [], sectors: [] },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function createHarness(options: { failUrl?: string; cachedUrls?: string[] } = {}) {
  const events: string[] = []
  let manifest: OfflinePackManifest | null = null
  let active: ActiveOfflinePack | null = null
  let assets: OfflineAssetOwnershipRecord[] = []
  let job: OfflineDownloadJobRecord | null = null
  const cached = new Set(options.cachedUrls ?? [])

  const repository: OfflinePackRepository = {
    listPacks: vi.fn(async () => active ? [active.pack] : []),
    getPack: vi.fn(async () => active?.pack ?? null),
    getActivePack: vi.fn(async () => active),
    stage: vi.fn(async (nextManifest: OfflinePackManifest, now: string) => {
      events.push('stage')
      manifest = nextManifest
      assets = nextManifest.assets.map((asset) => ({ id: `${nextManifest.version}:${asset.url}`, versionId: 'climb:1:v2', packId: nextManifest.packId, version: nextManifest.version, url: asset.url, estimatedBytes: asset.estimatedBytes, mediaType: asset.mediaType, state: 'pending', downloadedBytes: 0 }))
      job = { id: 'climb:1:v2', packId: nextManifest.packId, version: nextManifest.version, versionId: 'climb:1:v2', state: 'queued', completedAssets: 0, totalAssets: assets.length, downloadedBytes: 0, error: null, updatedAt: now }
      return job
    }),
    getVersion: vi.fn(async () => manifest ? { manifest } : null),
    listJobs: vi.fn(async () => job ? [job] : []),
    listVersionAssets: vi.fn(async () => assets),
    checkpointAsset: vi.fn(async (_versionId, url, bytes) => {
      events.push(`checkpoint:${url}`)
      assets = assets.map((asset) => asset.url === url ? { ...asset, state: 'cached', downloadedBytes: bytes } : asset)
      if (job) job = { ...job, completedAssets: job.completedAssets + 1 }
    }),
    failJob: vi.fn(async () => { events.push('failed') }),
    activate: vi.fn(async () => {
      events.push('activate')
      if (!manifest) throw new Error('missing manifest')
      const pack: OfflinePackRecord = { packId: manifest.packId, kind: manifest.kind, entityId: manifest.entityId, displayName: manifest.displayName, manifestUrl: manifest.manifestUrl, activeVersion: manifest.version, status: 'ready', installedAt: 'now', updatedAt: 'now', error: null }
      active = { pack, version: { id: 'climb:1:v2', packId: manifest.packId, version: manifest.version, manifest, state: 'active', createdAt: 'now' } }
      return 'climb:1:v1'
    }),
    removeVersion: vi.fn(async () => { events.push('gc'); return ['https://example.com/shared.webp'] }),
    discardFailedVersion: vi.fn(async () => { events.push('discard'); return ['https://example.com/a.webp'] }),
    removePack: vi.fn(async () => []),
     isAssetOwned: vi.fn(async (url) => url.endsWith('/shared.webp')),
     markAssetCached: vi.fn(async () => undefined),
     setPackHealth: vi.fn(async () => undefined),
     cleanOrphanRecords: vi.fn(async () => []),
  }

  const cache: OfflineMediaCache = {
    has: vi.fn(async (url) => cached.has(url)),
    download: vi.fn(async (url) => {
      events.push(`download:${url}`)
      if (url === options.failUrl) throw new Error('network interrupted')
      cached.add(url)
      return 50
    }),
    remove: vi.fn(async (url) => { events.push(`remove:${url}`) }),
    keys: vi.fn(async () => [...cached]),
  }
  const fetcher = vi.fn(async () => manifestResponse()) as unknown as typeof fetch
  const manager = new OfflinePackManager({ repository, cache, fetcher, concurrency: 2, now: () => 'now' })
  return { manager, repository, cache, events }
}

describe('offline pack manager', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { locks: { request: lockRequest } })
  })

  test('downloads, checkpoints, activates, then garbage collects without deleting shared media', async () => {
    const { manager, cache, events } = createHarness()

    const result = await manager.install('https://example.com/manifest')

    expect(result.active.pack.activeVersion).toBe('v2')
    expect(events.indexOf('stage')).toBeLessThan(events.indexOf('activate'))
    expect(events.filter((event) => event.startsWith('checkpoint:'))).toHaveLength(2)
    expect(events.indexOf('activate')).toBeLessThan(events.indexOf('gc'))
    expect(cache.remove).not.toHaveBeenCalledWith('https://example.com/shared.webp')
    expect(lockRequest).toHaveBeenCalledWith('offline-pack-lock', expect.any(Function))
  })

  test('returns the browser persistence result after installation', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: lockRequest },
      storage: {
        estimate: vi.fn(async () => ({ quota: 100 * 1024 * 1024, usage: 100 })),
        persisted: vi.fn(async () => false),
        persist: vi.fn(async () => true),
      },
    })
    const { manager } = createHarness()

    const result = await manager.install('https://example.com/manifest')

    expect(result.storageStatus).toMatchObject({ persisted: true, persistenceRequested: true })
  })

  test('keeps the durable job unactivated when a download is interrupted', async () => {
    const { manager, repository, events } = createHarness({ failUrl: 'https://example.com/a.webp' })

    await expect(manager.install('https://example.com/manifest')).rejects.toThrow('network interrupted')

    expect(repository.failJob).toHaveBeenCalled()
    expect(events).not.toContain('activate')
    expect(events).not.toContain('gc')
  })

  test('resumes pending ownership from an already cached response without redownloading', async () => {
    const { manager, cache } = createHarness({ cachedUrls: ['https://example.com/a.webp', 'https://example.com/shared.webp'] })

    await manager.install('https://example.com/manifest')

    expect(cache.download).not.toHaveBeenCalled()
  })

  test('discards a failed version that was superseded by a newer active version', async () => {
    const staleJob: OfflineDownloadJobRecord = {
      id: 'crag:1:old', packId: 'crag:1', version: 'old', versionId: 'crag:1:old', state: 'failed',
      completedAssets: 0, totalAssets: 1, downloadedBytes: 0, error: 'interrupted', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const activeRecord: OfflinePackRecord = {
      packId: 'crag:1', kind: 'crag', entityId: '1', displayName: 'Crag', manifestUrl: '/manifest',
      activeVersion: 'new', status: 'ready', installedAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z', error: null,
    }
    const repository: OfflinePackRepository = {
      listPacks: vi.fn(async () => []),
      getPack: vi.fn(async () => activeRecord),
      getActivePack: vi.fn(async () => null),
      stage: vi.fn(), getVersion: vi.fn(), listJobs: vi.fn(async () => [staleJob]), listVersionAssets: vi.fn(),
      checkpointAsset: vi.fn(), failJob: vi.fn(), activate: vi.fn(),
      discardFailedVersion: vi.fn(async () => ['https://example.com/old.webp']),
      removeVersion: vi.fn(async () => ['https://example.com/old.webp']), removePack: vi.fn(async () => []),
       isAssetOwned: vi.fn(async () => false), markAssetCached: vi.fn(), setPackHealth: vi.fn(async () => undefined), cleanOrphanRecords: vi.fn(async () => []),
    }
    const cache: OfflineMediaCache = {
      has: vi.fn(async () => false), download: vi.fn(), remove: vi.fn(async () => undefined), keys: vi.fn(async () => []),
    }

    await new OfflinePackManager({ repository, cache }).resume()

    expect(repository.removeVersion).toHaveBeenCalledWith(staleJob.versionId)
    expect(repository.activate).not.toHaveBeenCalled()
    expect(cache.remove).toHaveBeenCalledWith('https://example.com/old.webp')
  })

  test('discards only the failed version and removes its unowned partial media', async () => {
    const { manager, repository, cache, events } = createHarness()
    const failedJob: OfflineDownloadJobRecord = {
      id: 'climb:1:v2', packId: 'climb:1', version: 'v2', versionId: 'climb:1:v2', state: 'failed',
      completedAssets: 1, totalAssets: 2, downloadedBytes: 50, error: 'network interrupted', updatedAt: 'now',
    }
    vi.mocked(repository.listJobs).mockResolvedValueOnce([failedJob])

    await manager.discardFailed('climb:1')

    expect(repository.discardFailedVersion).toHaveBeenCalledWith('climb:1:v2', 'now')
    expect(cache.remove).toHaveBeenCalledWith('https://example.com/a.webp')
    expect(events).toContain('discard')
  })

  test('does not automatically retry permanent failures after restart', async () => {
    const { manager, repository } = createHarness()
    const permanentJob: OfflineDownloadJobRecord = {
      id: 'crag:1:v2', packId: 'crag:1', version: 'v2', versionId: 'crag:1:v2', state: 'failed',
      completedAssets: 0, totalAssets: 1, downloadedBytes: 0, error: 'Asset response has unexpected content type', updatedAt: 'now', failureKind: 'permanent',
    }
    vi.mocked(repository.listJobs).mockResolvedValueOnce([permanentJob])

    await manager.resume()

    expect(repository.listVersionAssets).not.toHaveBeenCalled()
    expect(repository.activate).not.toHaveBeenCalled()
  })

  test('repairs missing active media without replacing the active version', async () => {
    const { manager, repository, cache, events } = createHarness()
    const activeRecord = await repository.getActivePack('crag:1')
    expect(activeRecord).toBeNull()
    const active = {
      pack: { packId: 'crag:1', kind: 'crag' as const, entityId: 'crag-1', displayName: 'Crag', manifestUrl: '/manifest', activeVersion: 'v2', status: 'degraded' as const, installedAt: 'now', updatedAt: 'now', error: 'missing' },
      version: { id: 'crag:1:v2', packId: 'crag:1', version: 'v2', state: 'active' as const, createdAt: 'now', manifest: { packId: 'crag:1', kind: 'crag' as const, entityId: 'crag-1', displayName: 'Crag', version: 'v2', manifestUrl: '/manifest', estimatedBytes: 50, assets: [{ url: 'https://example.com/a.webp', estimatedBytes: 50, mediaType: 'image/webp' }], dependentManifestUrls: [], payload: {} } },
    }
    vi.mocked(repository.getActivePack).mockResolvedValue(active)
    vi.mocked(repository.listVersionAssets).mockResolvedValue([{ id: 'asset', versionId: 'crag:1:v2', packId: 'crag:1', version: 'v2', url: 'https://example.com/a.webp', estimatedBytes: 50, mediaType: 'image/webp', state: 'pending', downloadedBytes: 0 }])

    await manager.repair('crag:1')

    expect(cache.download).toHaveBeenCalledWith('https://example.com/a.webp', expect.anything(), 'image/webp')
    expect(repository.markAssetCached).toHaveBeenCalled()
    expect(repository.activate).not.toHaveBeenCalled()
    expect(events).toContain('download:https://example.com/a.webp')
  })

  test('passes the current time to orphan cleanup so stale failures can be collected', async () => {
    const { manager, repository } = createHarness()

    await manager.cleanupOrphans()

    expect(repository.cleanOrphanRecords).toHaveBeenCalledWith('now')
  })
})
