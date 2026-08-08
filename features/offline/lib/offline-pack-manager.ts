import { CacheApiOfflineMediaCache, type OfflineMediaCache } from '@/features/offline/lib/offline-pack-cache'
import { OfflinePackDatabase, offlineVersionId } from '@/features/offline/lib/offline-pack-database'
import { fetchOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'
import type {
  ActiveOfflinePack,
  OfflineAssetOwnershipRecord,
  OfflineDownloadJobRecord,
  OfflinePackManifest,
  OfflinePackRecord,
  OfflinePackInstallResult,
  OfflineStorageStatus,
} from '@/features/offline/lib/offline-pack-types'

const DEFAULT_CONCURRENCY = 4
const UNKNOWN_ASSET_ALLOWANCE_BYTES = 5 * 1024 * 1024

export interface OfflinePackRepository {
  listPacks(): Promise<OfflinePackRecord[]>
  getPack(packId: string): Promise<OfflinePackRecord | null>
  getActivePack(packId: string): Promise<ActiveOfflinePack | null>
  stage(manifest: OfflinePackManifest, now: string): Promise<OfflineDownloadJobRecord>
  getVersion(versionId: string): Promise<{ manifest: OfflinePackManifest } | null>
  listJobs(states?: OfflineDownloadJobRecord['state'][]): Promise<OfflineDownloadJobRecord[]>
  listVersionAssets(versionId: string): Promise<OfflineAssetOwnershipRecord[]>
  checkpointAsset(versionId: string, url: string, bytes: number, now: string): Promise<void>
  failJob(versionId: string, message: string, now: string): Promise<void>
  activate(versionId: string, now: string): Promise<string | null>
  removeVersion(versionId: string): Promise<string[]>
  removePack(packId: string): Promise<string[]>
  isAssetOwned(url: string): Promise<boolean>
  cleanOrphanRecords(): Promise<string[]>
}

export interface OfflinePackManagerOptions {
  repository?: OfflinePackRepository
  cache?: OfflineMediaCache
  fetcher?: typeof fetch
  concurrency?: number
  now?: () => string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Offline pack operation failed'
}

async function runBounded<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  let firstError: unknown = null
  async function worker() {
    while (index < items.length) {
      const item = items[index]
      index += 1
      try {
        await task(item)
      } catch (error) {
        firstError ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  if (firstError !== null) throw firstError
}

export class OfflinePackManager {
  private readonly repository: OfflinePackRepository
  private readonly cache: OfflineMediaCache
  private readonly fetcher: typeof fetch
  private readonly concurrency: number
  private readonly now: () => string
  private readonly operations = new Map<string, Promise<void>>()

  constructor(options: OfflinePackManagerOptions = {}) {
    this.repository = options.repository ?? new OfflinePackDatabase()
    this.cache = options.cache ?? new CacheApiOfflineMediaCache()
    this.fetcher = options.fetcher ?? fetch
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY))
    this.now = options.now ?? (() => new Date().toISOString())
  }

  list(): Promise<OfflinePackRecord[]> {
    return this.repository.listPacks()
  }

  getActive(packId: string): Promise<ActiveOfflinePack | null> {
    return this.repository.getActivePack(packId)
  }

  async storageStatus(requestPersistence = false): Promise<OfflineStorageStatus> {
    if (!('navigator' in globalThis) || !navigator.storage) {
      return { persisted: null, persistenceRequested: false, quota: null, usage: null, available: null }
    }
    const estimate = await navigator.storage.estimate()
    let persisted = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : null
    let persistenceRequested = false
    if (requestPersistence && persisted === false && typeof navigator.storage.persist === 'function') {
      persistenceRequested = true
      persisted = await navigator.storage.persist()
    }
    const quota = estimate.quota ?? null
    const usage = estimate.usage ?? null
    return { persisted, persistenceRequested, quota, usage, available: quota !== null && usage !== null ? Math.max(0, quota - usage) : null }
  }

  async install(manifestUrl: string): Promise<OfflinePackInstallResult> {
    const manifest = await this.loadManifest(manifestUrl)
    let storageStatus: OfflineStorageStatus | null = null
    await this.withCrossTabLock(async () => {
      await this.withPackLock(manifest.packId, async () => {
        const status = await this.storageStatus(true)
        storageStatus = status
        const requiredBytes = await this.requiredDownloadBytes(manifest)
        if (status.available !== null && requiredBytes > status.available * 0.9) {
          throw new Error('Not enough device storage for this offline pack')
        }
        const current = await this.repository.getActivePack(manifest.packId)
        if (current?.version.version === manifest.version) return
        await this.repository.stage(manifest, this.now())
        await this.downloadAndActivate(offlineVersionId(manifest.packId, manifest.version))
      })
    })
    const active = await this.repository.getActivePack(manifest.packId)
    if (!active) throw new Error('Offline pack activation failed')
    if (!storageStatus) throw new Error('Offline storage status unavailable')
    return { active, storageStatus }
  }

  async update(packId: string): Promise<ActiveOfflinePack> {
    const pack = await this.repository.getPack(packId)
    if (!pack) throw new Error('Offline pack is not installed')
    const result = await this.install(pack.manifestUrl)
    return result.active
  }

  async resume(): Promise<void> {
    await this.withCrossTabLock(async () => {
      await this.cleanupOrphansUnlocked()
      const jobs = await this.repository.listJobs(['queued', 'downloading', 'failed'])
      const latestByPack = new Map<string, OfflineDownloadJobRecord>()
      const discardedUrls: string[] = []
      for (const job of jobs) {
        const pack = await this.repository.getPack(job.packId)
        const supersededByActive = pack?.activeVersion && pack.activeVersion !== job.version
          && pack.error === null && pack.updatedAt >= job.updatedAt
        const current = latestByPack.get(job.packId)
        if (supersededByActive || (current && current.updatedAt >= job.updatedAt)) {
          discardedUrls.push(...await this.repository.removeVersion(job.versionId))
        } else {
          if (current) discardedUrls.push(...await this.repository.removeVersion(current.versionId))
          latestByPack.set(job.packId, job)
        }
      }
      await this.removeUnowned(discardedUrls)
      await runBounded([...latestByPack.values()], 1, (job) => this.withPackLock(job.packId, () => this.downloadAndActivate(job.versionId)))
    })
  }

  async remove(packId: string): Promise<void> {
    await this.withCrossTabLock(async () => {
      await this.withPackLock(packId, async () => {
        const urls = await this.repository.removePack(packId)
        const orphanUrls = await this.repository.cleanOrphanRecords()
        await this.removeUnowned([...urls, ...orphanUrls])
      })
    })
  }

  async cleanupOrphans(): Promise<void> {
    await this.withCrossTabLock(() => this.cleanupOrphansUnlocked())
  }

  private async cleanupOrphansUnlocked(): Promise<void> {
    const orphanUrls = await this.repository.cleanOrphanRecords()
    await this.removeUnowned(orphanUrls)
    const cachedUrls = await this.cache.keys()
    await this.removeUnowned(cachedUrls)
  }

  private async loadManifest(url: string): Promise<OfflinePackManifest> {
    const manifest = await fetchOfflinePackManifest(url, this.fetcher)
    if (manifest.dependentManifestUrls.length === 0) return manifest
    const children: OfflinePackManifest[] = []
    await runBounded(manifest.dependentManifestUrls, this.concurrency, async (childUrl) => {
      children.push(await fetchOfflinePackManifest(new URL(childUrl, url).href, this.fetcher))
    })
    if (children.some((child) => child.kind !== 'climb')) throw new Error('Crag pack contains a non-climb dependency')
    const assets = new Map(manifest.assets.map((asset) => [asset.url, asset]))
    for (const child of children) for (const asset of child.assets) assets.set(asset.url, asset)
    return { ...manifest, assets: [...assets.values()], payload: { manifest: manifest.payload, children: children.map((child) => child.payload) } }
  }

  private async requiredDownloadBytes(manifest: OfflinePackManifest): Promise<number> {
    const missing: typeof manifest.assets = []
    await runBounded(manifest.assets, this.concurrency, async (asset) => {
      if (!(await this.cache.has(asset.url))) missing.push(asset)
    })
    const knownTotal = manifest.assets.reduce((total, asset) => total + (asset.estimatedBytes ?? 0), 0)
    const knownMissing = missing.reduce((total, asset) => total + (asset.estimatedBytes ?? 0), 0)
    const hasUnknownMissingAsset = missing.some((asset) => asset.estimatedBytes === null)
    const unknownManifestBudget = Math.max(0, manifest.estimatedBytes - knownTotal)
    const unknownFallback = missing.filter((asset) => asset.estimatedBytes === null).length * UNKNOWN_ASSET_ALLOWANCE_BYTES
    return knownMissing + (hasUnknownMissingAsset ? Math.max(unknownManifestBudget, unknownFallback) : 0)
  }

  private async downloadAndActivate(versionId: string): Promise<void> {
    const version = await this.repository.getVersion(versionId)
    if (!version) return
    try {
      const assets = await this.repository.listVersionAssets(versionId)
      const pending = assets.filter((asset) => asset.state !== 'cached')
      await runBounded(pending, this.concurrency, async (asset) => {
        const bytes = await this.cache.has(asset.url) ? 0 : await this.cache.download(asset.url, this.fetcher, asset.mediaType)
        await this.repository.checkpointAsset(versionId, asset.url, bytes, this.now())
      })
      const oldVersionId = await this.repository.activate(versionId, this.now())
      if (oldVersionId) {
        const oldUrls = await this.repository.removeVersion(oldVersionId)
        await this.removeUnowned(oldUrls)
      }
    } catch (error) {
      await this.repository.failJob(versionId, errorMessage(error), this.now())
      throw error
    }
  }

  private async removeUnowned(urls: string[]): Promise<void> {
    for (const url of new Set(urls)) {
      if (!(await this.repository.isAssetOwned(url))) await this.cache.remove(url)
    }
  }

  private async withPackLock<T>(packId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(packId) ?? Promise.resolve()
    let release: () => void = () => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const queued = previous.then(() => current)
    this.operations.set(packId, queued)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.operations.get(packId) === queued) this.operations.delete(packId)
    }
  }

  private async withCrossTabLock<T>(operation: () => Promise<T>): Promise<T> {
    if (!('navigator' in globalThis) || !navigator.locks) return operation()
    return navigator.locks.request('offline-pack-lock', operation)
  }
}
