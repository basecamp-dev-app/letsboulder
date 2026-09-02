import type {
  ActiveOfflinePack,
  OfflineAssetOwnershipRecord,
  OfflineDownloadJobRecord,
  OfflinePackManifest,
  OfflinePackRecord,
  OfflinePackVersionRecord,
  OfflinePackStatus,
  OfflineMigrationRecord,
} from '@/features/offline/lib/offline-pack-types'

const DATABASE_NAME = 'letsboulder-offline-packs'
const DATABASE_VERSION = 2
const LEGACY_PACKS = 'packs'
const LEGACY_VERSIONS = 'versions'
const PACKS = 'packs-v2'
const VERSIONS = 'versions-v2'
const ASSETS = 'assets-v2'
const JOBS = 'jobs-v2'
const MIGRATIONS = 'migrations-v2'
export const OFFLINE_FAILED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface LegacyPackRecord extends Omit<OfflinePackRecord, 'status'> {
  status: 'installing' | 'ready' | 'degraded' | 'error'
}

interface LegacyVersionRecord {
  id: string
  packId: string
  version: string
  manifest: OfflinePackManifest
  state: 'staging' | 'active'
  createdAt: string
}

function migrationView(legacy: LegacyPackRecord, staged?: OfflinePackRecord): OfflinePackRecord {
  const message = staged?.error ?? (legacy.activeVersion ? 'Legacy Pack v1 requires online integrity migration' : legacy.error)
  return {
    ...legacy,
    status: legacy.activeVersion ? 'needs-repair' : 'not-saved',
    error: message,
    updatedAt: staged?.updatedAt ?? legacy.updatedAt,
    legacySource: true,
  }
}

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
        const migrations = database.createObjectStore(MIGRATIONS, { keyPath: 'id' })
        migrations.createIndex('state', 'state')
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
    const current = await requestResult<OfflinePackRecord[]>(database.transaction(PACKS).objectStore(PACKS).getAll())
    if (!database.objectStoreNames.contains(LEGACY_PACKS)) return current
    const legacy = await requestResult<LegacyPackRecord[]>(database.transaction(LEGACY_PACKS).objectStore(LEGACY_PACKS).getAll())
    const legacyById = new Map(legacy.map((pack) => [pack.packId, pack]))
    const visibleCurrent = current.map((pack) => {
      const legacyPack = legacyById.get(pack.packId)
      return !pack.activeVersion && legacyPack?.activeVersion ? migrationView(legacyPack, pack) : pack
    })
    const currentIds = new Set(current.map((pack) => pack.packId))
    return [...visibleCurrent, ...legacy.filter((pack) => !currentIds.has(pack.packId)).map((pack) => migrationView(pack))]
  }

  async getPack(packId: string): Promise<OfflinePackRecord | null> {
    const database = await this.open()
    const current = await requestResult<OfflinePackRecord | undefined>(database.transaction(PACKS).objectStore(PACKS).get(packId))
    if (current?.activeVersion || !database.objectStoreNames.contains(LEGACY_PACKS)) return current ?? null
    const legacy = await requestResult<LegacyPackRecord | undefined>(database.transaction(LEGACY_PACKS).objectStore(LEGACY_PACKS).get(packId))
    return legacy ? migrationView(legacy, current) : current ?? null
  }

  async getActivePack(packId: string): Promise<ActiveOfflinePack | null> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS], 'readonly')
    const pack = await requestResult<OfflinePackRecord | undefined>(transaction.objectStore(PACKS).get(packId))
    if (!pack?.activeVersion) {
      await transactionDone(transaction)
      if (!database.objectStoreNames.contains(LEGACY_PACKS) || !database.objectStoreNames.contains(LEGACY_VERSIONS)) return null
      const legacyTransaction = database.transaction([LEGACY_PACKS, LEGACY_VERSIONS], 'readonly')
      const legacyPack = await requestResult<LegacyPackRecord | undefined>(legacyTransaction.objectStore(LEGACY_PACKS).get(packId))
      if (!legacyPack?.activeVersion) { await transactionDone(legacyTransaction); return null }
      const legacyVersion = await requestResult<LegacyVersionRecord | undefined>(legacyTransaction.objectStore(LEGACY_VERSIONS).get(offlineVersionId(packId, legacyPack.activeVersion)))
      await transactionDone(legacyTransaction)
      return legacyVersion ? {
        pack: { ...legacyPack, status: 'needs-repair', error: 'Legacy Pack v1 requires online integrity migration', legacySource: true },
        version: { ...legacyVersion, state: 'active', verifiedAt: null, activatedAt: null, openedAt: null, source: 'legacy' },
      } : null
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
      status: existing?.activeVersion ? (existing.status === 'at-risk' ? 'at-risk' : 'verified') : 'downloading',
      installedAt: existing?.installedAt ?? null,
      updatedAt: now,
      error: null,
    }
    const version: OfflinePackVersionRecord = { id: versionId, packId: manifest.packId, version: manifest.version, manifest, state: 'staging', createdAt: now, verifiedAt: null, activatedAt: null, openedAt: null }
    const job: OfflineDownloadJobRecord = { id: versionId, packId: manifest.packId, version: manifest.version, versionId, state: 'queued', completedAssets: 0, totalAssets: manifest.assets.filter((asset) => asset.requirement === 'required').length, downloadedBytes: 0, error: null, updatedAt: now }
    transaction.objectStore(PACKS).put(pack)
    transaction.objectStore(VERSIONS).put(version)
    transaction.objectStore(JOBS).put(job)
    for (const asset of manifest.assets) {
      const ownership: OfflineAssetOwnershipRecord = { id: offlineAssetOwnershipId(versionId, asset.url), versionId, packId: manifest.packId, version: manifest.version, url: asset.url, contentKey: asset.contentKey, byteCount: asset.byteCount, mediaType: asset.mediaType, digest: asset.digest, requirement: asset.requirement, owningImageId: asset.owningImageId, owningClimbIds: asset.owningClimbIds, state: 'pending', downloadedBytes: 0, verifiedDigest: null }
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

  async checkpointAsset(versionId: string, url: string, bytes: number, digest: `sha256:${string}`, now: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([ASSETS, JOBS], 'readwrite')
    const assets = transaction.objectStore(ASSETS)
    const jobs = transaction.objectStore(JOBS)
    const assetId = offlineAssetOwnershipId(versionId, url)
    const asset = await requestResult<OfflineAssetOwnershipRecord | undefined>(assets.get(assetId))
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(jobs.get(versionId))
    if (!asset || !job) throw new Error('Offline download checkpoint is missing')
    if (bytes !== asset.byteCount || digest !== asset.digest) throw new Error('Offline asset verification checkpoint does not match manifest')
    if (asset.state !== 'verified') {
      assets.put({ ...asset, state: 'verified', downloadedBytes: bytes, verifiedDigest: digest })
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
      if (pack) packs.put({ ...pack, status: pack.activeVersion ? 'update-failed' : 'needs-repair', error: message, updatedAt: now })
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
    if (assets.some((asset) => asset.requirement === 'required' && (asset.state !== 'verified' || asset.verifiedDigest !== asset.digest || asset.downloadedBytes !== asset.byteCount))) throw new Error('Offline pack has pending assets')
    const packs = transaction.objectStore(PACKS)
    const pack = await requestResult<OfflinePackRecord | undefined>(packs.get(version.packId))
    if (!pack) throw new Error('Offline pack record is missing')
    const oldVersionId = pack.activeVersion ? offlineVersionId(pack.packId, pack.activeVersion) : null
    if (oldVersionId && oldVersionId !== versionId) {
      const oldVersion = await requestResult<OfflinePackVersionRecord | undefined>(versions.get(oldVersionId))
      if (oldVersion) versions.put({ ...oldVersion, state: 'retained' })
    }
    versions.put({ ...version, state: 'active', verifiedAt: now, activatedAt: now })
    packs.put({ ...pack, activeVersion: version.version, status: 'verified', installedAt: pack.installedAt ?? now, lastSuccessfulUpdateAt: now, updatedAt: now, error: null })
    transaction.objectStore(JOBS).put({ ...job, state: 'activated', error: null, updatedAt: now })
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
      if (pack.activeVersion) packs.put({ ...pack, status: 'verified', error: null, updatedAt: now })
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

  async markAssetCached(versionId: string, url: string, bytes: number, digest: `sha256:${string}`): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(ASSETS, 'readwrite')
    const store = transaction.objectStore(ASSETS)
    const asset = await requestResult<OfflineAssetOwnershipRecord | undefined>(store.get(offlineAssetOwnershipId(versionId, url)))
    if (!asset) throw new Error('Offline asset ownership record is missing')
    if (bytes !== asset.byteCount || digest !== asset.digest) throw new Error('Offline repair verification does not match manifest')
    store.put({ ...asset, state: 'verified', downloadedBytes: bytes, verifiedDigest: digest })
    await transactionDone(transaction)
  }

  async setPackHealth(packId: string, status: OfflinePackStatus, error: string | null, now: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(PACKS, 'readwrite')
    const store = transaction.objectStore(PACKS)
    const pack = await requestResult<OfflinePackRecord | undefined>(store.get(packId))
    if (pack) store.put({ ...pack, status, error, storageRisk: status === 'at-risk' ? true : status === 'verified' ? false : pack.storageRisk, updatedAt: now })
    await transactionDone(transaction)
  }

  async markOpened(versionId: string, now: string): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([VERSIONS, ASSETS, JOBS], 'readwrite')
    const versions = transaction.objectStore(VERSIONS)
    const version = await requestResult<OfflinePackVersionRecord | undefined>(versions.get(versionId))
    if (!version) { await transactionDone(transaction); return [] }
    versions.put({ ...version, openedAt: now })
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(transaction.objectStore(JOBS).get(versionId))
    if (job) transaction.objectStore(JOBS).put({ ...job, state: 'opened', updatedAt: now })
    const retained = await requestResult<OfflinePackVersionRecord[]>(versions.index('packId').getAll(version.packId))
    const urls: string[] = []
    for (const oldVersion of retained.filter((candidate) => candidate.state === 'retained')) {
      const assets = await requestResult<OfflineAssetOwnershipRecord[]>(transaction.objectStore(ASSETS).index('versionId').getAll(oldVersion.id))
      for (const asset of assets) { urls.push(asset.url); transaction.objectStore(ASSETS).delete(asset.id) }
      versions.delete(oldVersion.id)
      transaction.objectStore(JOBS).delete(oldVersion.id)
    }
    await transactionDone(transaction)
    return urls
  }

  async rollback(versionId: string, now: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, JOBS, MIGRATIONS], 'readwrite')
    const versions = transaction.objectStore(VERSIONS)
    const current = await requestResult<OfflinePackVersionRecord | undefined>(versions.get(versionId))
    if (!current || current.state !== 'active') throw new Error('Active offline version is missing')
    const candidates = await requestResult<OfflinePackVersionRecord[]>(versions.index('packId').getAll(current.packId))
    const retained = candidates.filter((candidate) => candidate.state === 'retained').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const packs = transaction.objectStore(PACKS)
    const pack = await requestResult<OfflinePackRecord | undefined>(packs.get(current.packId))
    if (!pack) throw new Error('Offline pack record is missing')
    const migrations = transaction.objectStore(MIGRATIONS)
    const migration = retained
      ? undefined
      : await requestResult<OfflineMigrationRecord | undefined>(migrations.get(current.packId))
    if (!retained && !migration?.legacyVersionId) throw new Error('No retained offline version is available')
    versions.put({ ...current, state: 'rolled-back' })
    if (retained) {
      versions.put({ ...retained, state: 'active' })
      packs.put({ ...pack, activeVersion: retained.version, status: 'verified', error: null, updatedAt: now })
    } else {
      // Removing only the v2 pack pointer makes the untouched v1 stores authoritative again.
      // The rolled-back v2 version and its ownership stay available for diagnostics/resume.
      packs.delete(current.packId)
      migrations.put({ ...migration as OfflineMigrationRecord, state: 'rolled-back', updatedAt: now })
    }
    const job = await requestResult<OfflineDownloadJobRecord | undefined>(transaction.objectStore(JOBS).get(versionId))
    if (job) transaction.objectStore(JOBS).put({ ...job, state: 'rolled-back', updatedAt: now })
    await transactionDone(transaction)
  }

  async listLegacyPacks(): Promise<OfflinePackRecord[]> {
    const database = await this.open()
    if (!database.objectStoreNames.contains(LEGACY_PACKS)) return []
    const legacy = await requestResult<LegacyPackRecord[]>(database.transaction(LEGACY_PACKS).objectStore(LEGACY_PACKS).getAll())
    return legacy.map((pack) => migrationView(pack))
  }

  async getMigration(packId: string): Promise<OfflineMigrationRecord | null> {
    const database = await this.open()
    return (await requestResult(database.transaction(MIGRATIONS).objectStore(MIGRATIONS).get(packId))) ?? null
  }

  async setMigration(record: OfflineMigrationRecord): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(MIGRATIONS, 'readwrite')
    transaction.objectStore(MIGRATIONS).put(record)
    await transactionDone(transaction)
  }

  async cleanOrphanRecords(now = new Date().toISOString()): Promise<string[]> {
    const database = await this.open()
    const transaction = database.transaction([PACKS, VERSIONS, ASSETS, JOBS], 'readwrite')
    const versionRecords = await requestResult<OfflinePackVersionRecord[]>(transaction.objectStore(VERSIONS).getAll())
    const activeVersionIds = new Set(versionRecords.filter((version) => version.state === 'active' || version.state === 'retained').map((version) => version.id))
    const versions = new Set(versionRecords.map((version) => version.id))
    const assets = await requestResult<OfflineAssetOwnershipRecord[]>(transaction.objectStore(ASSETS).getAll())
    const jobs = await requestResult<OfflineDownloadJobRecord[]>(transaction.objectStore(JOBS).getAll())
    const jobsByVersion = new Map(jobs.map((job) => [job.versionId, job]))
    const obsoleteVersions = new Set(versionRecords.filter((version) => {
      const job = jobsByVersion.get(version.id)
      const failedTooLong = job?.state === 'failed'
        && Date.parse(now) - Date.parse(job.updatedAt) >= OFFLINE_FAILED_JOB_RETENTION_MS
      return !activeVersionIds.has(version.id) && (!job || job.state === 'opened' || job.state === 'cancelled' || job.state === 'rolled-back' || failedTooLong)
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
