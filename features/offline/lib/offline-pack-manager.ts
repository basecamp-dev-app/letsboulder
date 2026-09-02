import { CacheApiOfflineMediaCache, type OfflineMediaCache } from '@/features/offline/lib/offline-pack-cache'
import { readOfflineCragPayload } from '@/features/offline/lib/offline-crag-reader'
import { OfflinePackDatabase, offlineVersionId } from '@/features/offline/lib/offline-pack-database'
import { fetchOfflineChildPackManifest, fetchOfflinePackManifest, parseOfflinePackManifest } from '@/features/offline/lib/offline-pack-manifest'
import type {
  ActiveOfflinePack,
  OfflineAssetOwnershipRecord,
  OfflineDownloadJobRecord,
  OfflinePackManifest,
  OfflinePackRecord,
  OfflinePackInstallResult,
  OfflinePackValidation,
  OfflineStorageStatus,
  OfflineMigrationRecord,
} from '@/features/offline/lib/offline-pack-types'

const DEFAULT_CONCURRENCY = 4

// The repository abstracts IndexedDB and Cache API details so install/activation rules remain testable without browsers.
export interface OfflinePackRepository {
  listPacks(): Promise<OfflinePackRecord[]>
  getPack(packId: string): Promise<OfflinePackRecord | null>
  getActivePack(packId: string): Promise<ActiveOfflinePack | null>
  stage(manifest: OfflinePackManifest, now: string): Promise<OfflineDownloadJobRecord>
  getVersion(versionId: string): Promise<{ manifest: OfflinePackManifest } | null>
  listJobs(states?: OfflineDownloadJobRecord['state'][]): Promise<OfflineDownloadJobRecord[]>
  listVersionAssets(versionId: string): Promise<OfflineAssetOwnershipRecord[]>
  checkpointAsset(versionId: string, url: string, bytes: number, digest: `sha256:${string}`, now: string): Promise<void>
  failJob(versionId: string, message: string, now: string, failureKind?: OfflineDownloadJobRecord['failureKind']): Promise<void>
  activate(versionId: string, now: string): Promise<string | null>
  rollback?(versionId: string, now: string): Promise<void>
  removeVersion(versionId: string): Promise<string[]>
  discardFailedVersion(versionId: string, now: string): Promise<string[]>
  removePack(packId: string): Promise<string[]>
  isAssetOwned(url: string): Promise<boolean>
  markAssetCached(versionId: string, url: string, bytes: number, digest: `sha256:${string}`): Promise<void>
  markOpened?(versionId: string, now: string): Promise<string[]>
  setPackHealth(packId: string, status: OfflinePackRecord['status'], error: string | null, now: string): Promise<void>
  cleanOrphanRecords(now?: string): Promise<string[]>
  listLegacyPacks?(): Promise<OfflinePackRecord[]>
  getMigration?(packId: string): Promise<OfflineMigrationRecord | null>
  setMigration?(record: OfflineMigrationRecord): Promise<void>
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

  async validateActive(packId: string): Promise<OfflinePackValidation | null> {
    const active = await this.repository.getActivePack(packId)
    if (!active) return null
    if (active.version.source === 'legacy') return { active, missingUrls: [], corruptUrls: [] }
    try {
      const stored = parseOfflinePackManifest(active.version.manifest.payload, active.version.manifest.manifestUrl)
      if (stored.packId !== packId || stored.version !== active.version.version) throw new Error('Stored offline manifest identity does not match')
    } catch {
      await this.repository.setPackHealth(packId, 'needs-repair', 'Required offline metadata is missing or corrupt', this.now())
      return { active, missingUrls: [], corruptUrls: ['indexeddb:manifest'] }
    }
    const assets = await this.repository.listVersionAssets(active.version.id)
    const ownedUrls = new Set(assets.map((asset) => asset.url))
    const manifestAssets = active.version.manifest.assets.filter((asset) => asset.requirement === 'required' && !ownedUrls.has(asset.url)).map((asset) => asset.url)
    const missingUrls: string[] = []
    const corruptUrls: string[] = []
    await runBounded(assets, this.concurrency, async (asset) => {
      if (asset.requirement !== 'required') return
      try {
        await this.verifyCached(asset)
      } catch (error) {
        if (errorMessage(error).startsWith('Required cached asset is missing')) missingUrls.push(asset.url)
        else corruptUrls.push(asset.url)
      }
    })
    missingUrls.push(...manifestAssets)
    if (missingUrls.length > 0 || corruptUrls.length > 0) {
      await this.repository.setPackHealth(packId, 'needs-repair', `${missingUrls.length + corruptUrls.length} required asset integrity ${missingUrls.length + corruptUrls.length === 1 ? 'check' : 'checks'} failed`, this.now())
    } else if (active.pack.status === 'needs-repair') {
      await this.repository.setPackHealth(packId, active.pack.storageRisk ? 'at-risk' : 'verified', active.pack.storageRisk ? 'Browser storage persistence was not granted' : null, this.now())
    }
    return { active, missingUrls, corruptUrls }
  }

  async markOpened(packId: string): Promise<void> {
    await this.withCrossTabLock(() => this.withPackLock(packId, async () => {
      const active = await this.repository.getActivePack(packId)
      if (!active || active.version.source === 'legacy') return
      const urls = await this.repository.markOpened?.(active.version.id, this.now()) ?? []
      const migration = await this.repository.getMigration?.(packId)
      if (migration?.state === 'activated') await this.repository.setMigration?.({ ...migration, state: 'opened', updatedAt: this.now() })
      await this.removeUnowned(urls)
    }))
  }

  async rollback(packId: string): Promise<void> {
    await this.withCrossTabLock(() => this.withPackLock(packId, async () => {
      const active = await this.repository.getActivePack(packId)
      if (!active || !this.repository.rollback) throw new Error('No active Pack v2 version can be rolled back')
      await this.repository.rollback(active.version.id, this.now())
      const migration = await this.repository.getMigration?.(packId)
      if (migration) await this.repository.setMigration?.({ ...migration, state: 'rolled-back', updatedAt: this.now() })
      await this.cleanupOrphansUnlocked()
    }))
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
    const storageStatus = await this.storageStatus(true)
    await this.withCrossTabLock(async () => {
      await this.withPackLock(manifest.packId, async () => {
        const requiredBytes = await this.requiredDownloadBytes(manifest)
        if (storageStatus.available !== null && requiredBytes > storageStatus.available * 0.9) {
          throw new Error('Storage quota is too small for this offline pack')
        }
        const current = await this.repository.getActivePack(manifest.packId)
        if (current?.version.version === manifest.version) return
        await this.repository.stage(manifest, this.now())
        await this.downloadAndActivate(offlineVersionId(manifest.packId, manifest.version))
      })
    })
    let active = await this.repository.getActivePack(manifest.packId)
    if (!active) throw new Error('Offline pack activation failed')
    if (storageStatus.persisted === false) {
      await this.repository.setPackHealth(manifest.packId, 'at-risk', 'Browser storage persistence was not granted', this.now())
      active = await this.repository.getActivePack(manifest.packId)
      if (!active) throw new Error('Offline pack activation failed')
    } else if (storageStatus.persisted === true) {
      await this.repository.setPackHealth(manifest.packId, 'verified', null, this.now())
      active = await this.repository.getActivePack(manifest.packId)
      if (!active) throw new Error('Offline pack activation failed')
    }
    return { active, storageStatus }
  }

  async update(packId: string): Promise<ActiveOfflinePack> {
    const pack = await this.repository.getPack(packId)
    if (!pack) throw new Error('Offline pack is not installed')
    const migration = pack.legacySource && pack.activeVersion && this.repository.setMigration
      ? {
          id: pack.packId, packId: pack.packId,
          legacyVersionId: offlineVersionId(pack.packId, pack.activeVersion), targetVersionId: null,
          state: 'staging' as const, error: null, updatedAt: this.now(),
        }
      : null
    try {
      if (migration) await this.repository.setMigration?.(migration)
      const result = await this.install(pack.manifestUrl)
      if (migration) {
        await this.repository.setMigration?.({ ...migration, targetVersionId: result.active.version.id, state: 'activated', updatedAt: this.now() })
      }
      return result.active
    } catch (error) {
      if (migration) await this.repository.setMigration?.({ ...migration, state: 'failed', error: errorMessage(error), updatedAt: this.now() })
      await this.repository.setPackHealth(packId, pack.activeVersion ? 'update-failed' : 'needs-repair', errorMessage(error), this.now())
      throw error
    }
  }

  async repair(packId: string): Promise<void> {
    await this.withCrossTabLock(() => this.withPackLock(packId, async () => {
      const active = await this.repository.getActivePack(packId)
      if (!active) throw new Error('Offline crag is not installed')
      try {
        const assets = await this.repository.listVersionAssets(active.version.id)
        const stored = parseOfflinePackManifest(active.version.manifest.payload, active.version.manifest.manifestUrl)
        const ownedUrls = new Set(assets.map((asset) => asset.url))
        if (stored.assets.some((asset) => asset.requirement === 'required' && !ownedUrls.has(asset.url))) {
          throw new Error('Required offline metadata is missing; update the guide while connected')
        }
        await runBounded(assets.filter((asset) => asset.requirement === 'required'), this.concurrency, async (asset) => {
          try {
            await this.verifyCached(asset)
          } catch {
            await this.cache.remove(asset.url)
            const bytes = await this.cache.download(asset.url, this.fetcher, asset.mediaType, asset.byteCount, asset.digest)
            await this.repository.markAssetCached(active.version.id, asset.url, bytes, asset.digest)
          }
        })
        await this.repository.setPackHealth(packId, active.pack.storageRisk ? 'at-risk' : 'verified', active.pack.storageRisk ? 'Browser storage persistence was not granted' : null, this.now())
      } catch (error) {
        const message = errorMessage(error)
        await this.repository.setPackHealth(packId, 'needs-repair', message, this.now())
        throw error
      }
    }))
  }

  async resume(): Promise<void> {
    await this.withCrossTabLock(async () => {
      await this.cleanupOrphansUnlocked()
      const jobs = (await this.repository.listJobs(['queued', 'downloading', 'failed'])).filter((job) => job.state !== 'failed' || job.failureKind !== 'permanent')
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
      let downloadError: unknown = null
      try {
        await runBounded([...latestByPack.values()], 1, (job) => this.withPackLock(job.packId, () => this.downloadAndActivate(job.versionId)))
      } catch (error) {
        downloadError = error
      }
      const packs = await this.repository.listPacks()
      await runBounded(packs.filter((pack) => pack.activeVersion !== null), this.concurrency, async (pack) => { await this.validateActive(pack.packId) })
      if (downloadError !== null) throw downloadError
    })
  }

  async migrateLegacyPacks(): Promise<void> {
    if (!this.repository.listLegacyPacks || !this.repository.getMigration || !this.repository.setMigration) return
    const legacyPacks = (await this.repository.listLegacyPacks()).filter((pack) => pack.activeVersion !== null)
    for (const legacy of legacyPacks) {
      const existing = await this.repository.getMigration(legacy.packId)
      if (existing?.state === 'opened') continue
      const base: OfflineMigrationRecord = {
        id: legacy.packId, packId: legacy.packId,
        legacyVersionId: offlineVersionId(legacy.packId, legacy.activeVersion as string),
        targetVersionId: existing?.targetVersionId ?? null, state: 'staging', error: null, updatedAt: this.now(),
      }
      await this.repository.setMigration(base)
      try {
        const result = await this.install(legacy.manifestUrl)
        await this.repository.setMigration({ ...base, targetVersionId: result.active.version.id, state: 'activated', updatedAt: this.now() })
      } catch (error) {
        await this.repository.setMigration({ ...base, state: 'failed', error: errorMessage(error), updatedAt: this.now() })
      }
    }
  }

  async remove(packId: string): Promise<void> {
    await this.withCrossTabLock(async () => {
      await this.withPackLock(packId, async () => {
        const urls = await this.repository.removePack(packId)
        const orphanUrls = await this.repository.cleanOrphanRecords(this.now())
        await this.removeUnowned([...urls, ...orphanUrls])
      })
    })
  }

  async discardFailed(packId: string): Promise<void> {
    await this.withCrossTabLock(async () => {
      await this.withPackLock(packId, async () => {
        const jobs = await this.repository.listJobs(['failed', 'cancelled'])
        const job = jobs.filter((candidate) => candidate.packId === packId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        if (!job) return
        const urls = await this.repository.discardFailedVersion(job.versionId, this.now())
        await this.removeUnowned(urls)
      })
    })
  }

  async cleanupOrphans(): Promise<void> {
    await this.withCrossTabLock(() => this.cleanupOrphansUnlocked())
  }

  private async cleanupOrphansUnlocked(): Promise<void> {
    const orphanUrls = await this.repository.cleanOrphanRecords(this.now())
    await this.removeUnowned(orphanUrls)
    const cachedUrls = await this.cache.keys()
    await this.removeUnowned(cachedUrls)
  }

  private async loadManifest(url: string): Promise<OfflinePackManifest> {
    const manifest = await fetchOfflinePackManifest(url, this.fetcher)
    if (manifest.kind !== 'crag') throw new Error('Only crag guides can be saved offline')
    if (manifest.dependentManifestUrls.length === 0) {
      this.assertReadablePayload(manifest)
      return manifest
    }
    const children: Awaited<ReturnType<typeof fetchOfflineChildPackManifest>>[] = []
    await runBounded(manifest.dependentManifestUrls, this.concurrency, async (childUrl) => {
      children.push(await fetchOfflineChildPackManifest(new URL(childUrl, url).href, this.fetcher))
    })
    const assets = new Map(manifest.assets.map((asset) => [asset.url, asset]))
    for (const child of children) for (const asset of child.assets) assets.set(asset.url, asset)
    const combined = { ...manifest, assets: [...assets.values()], payload: { manifest: manifest.payload, children: children.map((child) => child.payload) } }
    this.assertReadablePayload(combined)
    return combined
  }

  private assertReadablePayload(manifest: OfflinePackManifest): void {
    const payload = readOfflineCragPayload(manifest.payload)
    if (!payload || payload.packId !== manifest.packId || payload.cragId !== manifest.entityId) {
      throw new Error('Offline guide data is incomplete or incompatible')
    }
  }

  private async requiredDownloadBytes(manifest: OfflinePackManifest): Promise<number> {
    const missing: typeof manifest.assets = []
    await runBounded(manifest.assets, this.concurrency, async (asset) => {
      if (asset.requirement !== 'required') return
      try {
        if (!this.cache.verify) throw new Error('Integrity verification is unavailable')
        await this.cache.verify(asset.url, asset.mediaType, asset.byteCount, asset.digest)
      } catch {
        missing.push(asset)
      }
    })
    return missing.reduce((total, asset) => total + asset.byteCount, 0)
  }

  private async downloadAndActivate(versionId: string): Promise<void> {
    const version = await this.repository.getVersion(versionId)
    if (!version) return
    try {
      const assets = await this.repository.listVersionAssets(versionId)
      const pending: OfflineAssetOwnershipRecord[] = []
      for (const asset of assets) if (asset.requirement === 'required' && asset.state !== 'verified') pending.push(asset)
      await runBounded(pending, this.concurrency, async (asset) => {
        let verified
        try {
          verified = await this.verifyCached(asset)
        } catch {
          await this.cache.remove(asset.url)
          const bytes = await this.cache.download(asset.url, this.fetcher, asset.mediaType, asset.byteCount, asset.digest)
          verified = { byteCount: bytes, digest: asset.digest }
        }
        await this.repository.checkpointAsset(versionId, asset.url, verified.byteCount, verified.digest, this.now())
      })
      await this.repository.setPackHealth(version.manifest.packId, 'verifying', null, this.now())
      const migration = await this.repository.getMigration?.(version.manifest.packId)
      if (migration && migration.state !== 'opened') {
        await this.repository.setMigration?.({ ...migration, targetVersionId: versionId, state: 'verified', error: null, updatedAt: this.now() })
      }
      const oldVersionId = await this.repository.activate(versionId, this.now())
      if (migration && migration.state !== 'opened') {
        await this.repository.setMigration?.({ ...migration, targetVersionId: versionId, state: 'activated', error: null, updatedAt: this.now() })
      }
      // The prior version remains retained until the new version opens successfully.
      void oldVersionId
    } catch (error) {
      const message = errorMessage(error)
      const failureKind = message.startsWith('Asset response ') || message.startsWith('Offline pack is incomplete') || message.startsWith('Offline pack has pending assets')
        ? 'permanent'
        : 'resumable'
      await this.repository.failJob(versionId, message, this.now(), failureKind)
      throw error
    }
  }

  private async removeUnowned(urls: string[]): Promise<void> {
    for (const url of new Set(urls)) {
      if (!(await this.repository.isAssetOwned(url))) await this.cache.remove(url)
    }
  }

  private async verifyCached(asset: OfflineAssetOwnershipRecord): Promise<{ byteCount: number; digest: `sha256:${string}` }> {
    if (!this.cache.verify) throw new Error('Offline cache cannot perform integrity verification')
    return this.cache.verify(asset.url, asset.mediaType, asset.byteCount, asset.digest)
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
