import type {
  ActiveOfflinePack,
  OfflineAssetOwnershipRecord,
  OfflineDownloadJobRecord,
  OfflinePackManifest,
  OfflinePackRecord,
  OfflinePackVersionRecord,
} from '@/features/offline/lib/offline-pack-types'

const DATABASE_NAME = 'letsboulder-offline-packs'
const DATABASE_VERSION = 1
const PACKS = 'packs'
const VERSIONS = 'versions'
const ASSETS = 'assets'
const JOBS = 'jobs'
export const OFFLINE_FAILED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

export function offlineVersionId(packId: string, version: string): string {
  return `${packId}:${version}`
}

export function offlineAssetOwnershipId(versionId: string, url: string): string {
  return `${versionId}:${url}`
}

export class OfflinePackDatabase {
  private connection: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection
    this.connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        const packs = database.createObjectStore(PACKS, { keyPath: 'packId' })
        packs.createIndex('status', 'status')
        const versions = database.createObjectStore(VERSIONS, { keyPath: 'id' })
        versions.createIndex('packId', 'packId')
        const assets = database.createObjectStore(ASSETS, { keyPath: 'id' })
        assets.createIndex('versionId', 'versionId')
        assets.createIndex('url', 'url')
        const jobs = database.createObjectStore(JOBS, { keyPath: 'id' })
        jobs.createIndex('state', 'state')
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close()
          this.connection = null
        }
        resolve(request.result)
      }
      request.onerror = () => {
        this.connection = null
        reject(request.error ?? new Error('Unable to open offline pack database'))
      }
      request.onblocked = () => {
        this.connection = null
        reject(new Error('Offline pack database upgrade is blocked'))
      }
    })
    return this.connection
  }

  async listPacks(): Promise<OfflinePackRecord[]> {
    const database = await this.open()
    return requestResult(database.transaction(PACKS).objectStore(PACKS).getAll())
  }

  async getPack(packId: string): Promise<OfflinePackRecord | null> {
    const database = await this.open()
    return (await requestResult(database.transaction(PACKS).objectStore(PACKS).get(packId))) ?? null
  }

  async getActivePack(packId: string): Promise<ActiveOfflinePack | null> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS], 'readonly')
    const pack = await requestResult<OfflinePackRecord | undefined>(transaction.objectStore(PACKS).get(packId))
    if (!pack?.activeVersion) {
      await transactionDone(transaction)
      return null
    }
    const version = await requestResult<OfflinePackVersionRecord | undefined>(
      transaction.objectStore(VERSIONS).get(offlineVersionId(packId, pack.activeVersion)),
    )
    await transactionDone(transaction)
    return version ? { pack, version } : null
  }

  async stage(manifest: OfflinePackManifest, now: string): Promise<OfflineDownloadJobRecord> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const existing = await requestResult<OfflinePackRecord | undefined>(transaction.objectStore(PACKS).get(manifest.packId))
    const versionId = offlineVersionId(manifest.packId, manifest.version)
    const pack: OfflinePackRecord = {
      packId: manifest.packId,
      kind: manifest.kind,
      entityId: manifest.entityId,
      displayName: manifest.displayName,
      manifestUrl: manifest.manifestUrl,
      activeVersion: existing?.activeVersion ?? null,
      status: existing?.activeVersion ? 'ready' : 'installing',
      installedAt: existing?.installedAt ?? null,
      updatedAt: now,
      error: null,
    }
    const version: OfflinePackVersionRecord = { id: versionId, packId: manifest.packId, version: manifest.version, manifest, state: 'staging', createdAt: now }
    const job: OfflineDownloadJobRecord = { id: versionId, packId: manifest.packId, version: manifest.version, versionId, state: 'queued', completedAssets: 0, totalAssets: manifest.assets.length, downloadedBytes: 0, error: null, updatedAt: now }
    transaction.objectStore(PACKS).put(pack)
    transaction.objectStore(VERSIONS).put(version)
    transaction.objectStore(JOBS).put(job)
    for (const asset of manifest.assets) {
      const ownership: OfflineAssetOwnershipRecord = { id: offlineAssetOwnershipId(versionId, asset.url), versionId, packId: manifest.packId, version: manifest.version, url: asset.url, estimatedBytes: asset.estimatedBytes, mediaType: asset.mediaType, state: 'pending', downloadedBytes: 0 }
      transaction.objectStore(ASSETS).put(ownership)
    }
    await transactionDone(transaction)
    return job
  }

  async getVersion(versionId: string): Promise<OfflinePackVersionRecord | null> {
    const database = await this.open()
    return (await requestResult(database.transaction(VERSIONS).objectStore(VERSIONS).get(versionId))) ?? null
  }

  async listJobs(states?: OfflineDownloadJobRecord['state'][]): Promise<OfflineDownloadJobRecord[]> {
    const database = await this.open()
    const jobs = await requestResult<OfflineDownloadJobRecord[]>(database.transaction(JOBS).objectStore(JOBS).getAll())
    return states ? jobs.filter((job) => states.includes(job.state)) : jobs
  }

  async listVersionAssets(versionId: string): Promise<OfflineAssetOwnershipRecord[]> {
    const database = await this.open()
    const index = database.transaction(ASSETS).objectStore(ASSETS).index('versionId')
    return requestResult(index.getAll(versionId))
  }

  async checkpointAsset(versionId: string, url: string, bytes: number, now: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([ASSETS, JOBS], 'readwrite')
    const assets = transaction.objectStore(ASSETS)
    const jobs = transaction.objectStore(JOBS)
    const assetId = offlineAssetOwnershipId(versionId, url)
    const asset = await requestResult<OfflineAssetOwnershipRecord | undefined>(assets.get(assetId))
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(jobs.get(versionId))
    if (!asset || !job) throw new Error('Offline download checkpoint is missing')
    if (asset.state !== 'cached') {
      assets.put({ ...asset, state: 'cached', downloadedBytes: bytes })
      jobs.put({ ...job, state: 'downloading', completedAssets: job.completedAssets + 1, downloadedBytes: job.downloadedBytes + bytes, error: null, updatedAt: now })
    }
    await transactionDone(transaction)
  }

  async failJob(versionId: string, message: string, now: string, failureKind: OfflineDownloadJobRecord['failureKind'] = 'resumable'): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, JOBS], 'readwrite')
    const jobs = transaction.objectStore(JOBS)
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(jobs.get(versionId))
    if (job) {
      jobs.put({ ...job, state: 'failed', failureKind, error: message, updatedAt: now })
      const packs = transaction.objectStore(PACKS)
      const pack = await requestResult<OfflinePackRecord | undefined>(packs.get(job.packId))
      if (pack) packs.put({ ...pack, status: pack.activeVersion ? 'ready' : 'error', error: message, updatedAt: now })
    }
    await transactionDone(transaction)
  }

  async activate(versionId: string, now: string): Promise<string | null> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const versions = transaction.objectStore(VERSIONS)
    const version = await requestResult<OfflinePackVersionRecord | undefined>(versions.get(versionId))
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(transaction.objectStore(JOBS).get(versionId))
    if (!version || !job || job.completedAssets !== job.totalAssets) throw new Error('Offline pack is incomplete')
    const assets = await requestResult<OfflineAssetOwnershipRecord[]>(transaction.objectStore(ASSETS).index('versionId').getAll(versionId))
    if (assets.some((asset) => asset.state !== 'cached')) throw new Error('Offline pack has pending assets')
    const packs = transaction.objectStore(PACKS)
    const pack = await requestResult<OfflinePackRecord | undefined>(packs.get(version.packId))
    if (!pack) throw new Error('Offline pack record is missing')
    const oldVersionId = pack.activeVersion ? offlineVersionId(pack.packId, pack.activeVersion) : null
    versions.put({ ...version, state: 'active' })
    packs.put({ ...pack, activeVersion: version.version, status: 'ready', installedAt: pack.installedAt ?? now, updatedAt: now, error: null })
    transaction.objectStore(JOBS).put({ ...job, state: 'complete', error: null, updatedAt: now })
    await transactionDone(transaction)
    return oldVersionId === versionId ? null : oldVersionId
  }

  async removeVersion(versionId: string): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([VERSIONS, ASSETS, JOBS], 'readwrite')
    const assetsStore = transaction.objectStore(ASSETS)
    const assets = await requestResult<OfflineAssetOwnershipRecord[]>(assetsStore.index('versionId').getAll(versionId))
    for (const asset of assets) assetsStore.delete(asset.id)
    transaction.objectStore(VERSIONS).delete(versionId)
    transaction.objectStore(JOBS).delete(versionId)
    await transactionDone(transaction)
    return assets.map((asset) => asset.url)
  }

  async discardFailedVersion(versionId: string, now: string): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const jobs = transaction.objectStore(JOBS)
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(jobs.get(versionId))
    if (!job || (job.state !== 'failed' && job.state !== 'cancelled')) {
      await transactionDone(transaction)
      return []
    }
    const assetsStore = transaction.objectStore(ASSETS)
    const assets = await requestResult<OfflineAssetOwnershipRecord[]>(assetsStore.index('versionId').getAll(versionId))
    for (const asset of assets) assetsStore.delete(asset.id)
    transaction.objectStore(VERSIONS).delete(versionId)
    jobs.delete(versionId)
    const packs = transaction.objectStore(PACKS)
    const pack = await requestResult<OfflinePackRecord | undefined>(packs.get(job.packId))
    if (pack) {
      if (pack.activeVersion) packs.put({ ...pack, status: 'ready', error: null, updatedAt: now })
      else packs.delete(pack.packId)
    }
    await transactionDone(transaction)
    return assets.map((asset) => asset.url)
  }

  async removePack(packId: string): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const versions = await requestResult<OfflinePackVersionRecord[]>(transaction.objectStore(VERSIONS).index('packId').getAll(packId))
    const urls: string[] = []
    for (const version of versions) {
      const assets = await requestResult<OfflineAssetOwnershipRecord[]>(transaction.objectStore(ASSETS).index('versionId').getAll(version.id))
      for (const asset of assets) {
        urls.push(asset.url)
        transaction.objectStore(ASSETS).delete(asset.id)
      }
      transaction.objectStore(VERSIONS).delete(version.id)
      transaction.objectStore(JOBS).delete(version.id)
    }
    transaction.objectStore(PACKS).delete(packId)
    await transactionDone(transaction)
    return urls
  }

  async isAssetOwned(url: string): Promise<boolean> {
    const database = await this.open()
    return (await requestResult(database.transaction(ASSETS).objectStore(ASSETS).index('url').count(url))) > 0
  }

  async cleanOrphanRecords(now = new Date().toISOString()): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const packs = await requestResult<OfflinePackRecord[]>(transaction.objectStore(PACKS).getAll())
    const activeVersionIds = new Set(packs.flatMap((pack) => pack.activeVersion ? [offlineVersionId(pack.packId, pack.activeVersion)] : []))
    const versionRecords = await requestResult<OfflinePackVersionRecord[]>(transaction.objectStore(VERSIONS).getAll())
    const versions = new Set(versionRecords.map((version) => version.id))
    const assets = await requestResult<OfflineAssetOwnershipRecord[]>(transaction.objectStore(ASSETS).getAll())
    const jobs = await requestResult<OfflineDownloadJobRecord[]>(transaction.objectStore(JOBS).getAll())
    const jobsByVersion = new Map(jobs.map((job) => [job.versionId, job]))
    const obsoleteVersions = new Set(versionRecords.filter((version) => {
      const job = jobsByVersion.get(version.id)
      const failedTooLong = job?.state === 'failed'
        && Date.parse(now) - Date.parse(job.updatedAt) >= OFFLINE_FAILED_JOB_RETENTION_MS
      const failedPermanently = job?.state === 'failed' && job.failureKind === 'permanent'
      return !activeVersionIds.has(version.id) && (!job || job.state === 'complete' || job.state === 'cancelled' || failedTooLong || failedPermanently)
    }).map((version) => version.id))
    const orphanUrls: string[] = []
    for (const asset of assets) if (!versions.has(asset.versionId) || obsoleteVersions.has(asset.versionId)) {
      orphanUrls.push(asset.url)
      transaction.objectStore(ASSETS).delete(asset.id)
    }
    for (const versionId of obsoleteVersions) transaction.objectStore(VERSIONS).delete(versionId)
    for (const job of jobs) if (!versions.has(job.versionId) || obsoleteVersions.has(job.versionId)) transaction.objectStore(JOBS).delete(job.id)
    await transactionDone(transaction)
    return orphanUrls
  }
}
