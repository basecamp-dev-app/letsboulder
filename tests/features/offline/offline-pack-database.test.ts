import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { OfflinePackDatabase, offlineVersionId } from '@/features/offline/lib/offline-pack-database'
import type { OfflinePackManifest } from '@/features/offline/lib/offline-pack-types'

const manifest: OfflinePackManifest = {
  packId: 'crag:db-test', kind: 'crag', entityId: 'db-test', displayName: 'Database Crag',
  version: 'v2', manifestUrl: '/manifest', exactTotalBytes: 3,
  assets: [{ url: 'https://cdn.example/topo.webp', contentKey: 'topo-v2', byteCount: 3, mediaType: 'image/webp', digest: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', requirement: 'required', owningImageId: 'image-1', owningClimbIds: ['climb-1'] }],
  dependentManifestUrls: [], payload: { type: 'crag' },
}

function withVersion(version: string): OfflinePackManifest {
  return { ...manifest, version, payload: { type: 'crag', version } }
}

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('letsboulder-offline-packs')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

async function seedLegacyPack() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('letsboulder-offline-packs', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('packs', { keyPath: 'packId' })
      request.result.createObjectStore('versions', { keyPath: 'id' })
      request.result.createObjectStore('assets', { keyPath: 'id' })
      request.result.createObjectStore('jobs', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = database.transaction(['packs', 'versions'], 'readwrite')
  transaction.objectStore('packs').put({
    packId: manifest.packId, kind: 'crag', entityId: manifest.entityId, displayName: 'Legacy Crag',
    manifestUrl: manifest.manifestUrl, activeVersion: 'v1', status: 'ready', installedAt: 'old', updatedAt: 'old', error: null,
  })
  transaction.objectStore('versions').put({
    id: offlineVersionId(manifest.packId, 'v1'), packId: manifest.packId, version: 'v1',
    manifest: { ...manifest, version: 'v1', payload: { type: 'crag', version: 'v1' } }, state: 'active', createdAt: 'old',
  })
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

describe('OfflinePackDatabase with IndexedDB', () => {
  beforeEach(async () => { await deleteDatabase() })

  test('stages, checkpoints, activates, and records the successful update', async () => {
    const database = new OfflinePackDatabase()
    const job = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(job.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T10:01:00.000Z')
    expect(await database.activate(job.versionId, '2026-08-10T10:02:00.000Z')).toBeNull()

    const active = await database.getActivePack(manifest.packId)
    expect(active?.pack).toMatchObject({ activeVersion: 'v2', status: 'verified', lastSuccessfulUpdateAt: '2026-08-10T10:02:00.000Z' })
    expect((await database.listJobs())[0]).toMatchObject({ state: 'activated', completedAssets: 1, downloadedBytes: 3 })
    expect((await database.listVersionAssets(offlineVersionId(manifest.packId, 'v2')))[0]).toMatchObject({ state: 'verified', downloadedBytes: 3 })
  })

  test('persists resumable and permanent failures, then removes failed versions', async () => {
    const database = new OfflinePackDatabase()
    const job = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.failJob(job.versionId, 'offline', '2026-08-10T10:01:00.000Z', 'resumable')
    expect((await database.listJobs(['failed']))[0]).toMatchObject({ failureKind: 'resumable', error: 'offline' })
    await database.failJob(job.versionId, 'bad media', '2026-08-10T10:02:00.000Z', 'permanent')
    expect((await database.listJobs(['failed']))[0]).toMatchObject({ failureKind: 'permanent', error: 'bad media' })
    await expect(database.discardFailedVersion(job.versionId, '2026-08-10T10:03:00.000Z')).resolves.toEqual([manifest.assets[0].url])
    await expect(database.listPacks()).resolves.toEqual([])
  })

  test('retains the previous verified version until first successful open and preserves shared ownership', async () => {
    const database = new OfflinePackDatabase()
    const first = await database.stage(withVersion('v2-a'), '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(first.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T10:01:00.000Z')
    await database.activate(first.versionId, '2026-08-10T10:02:00.000Z')
    const second = await database.stage(withVersion('v2-b'), '2026-08-10T11:00:00.000Z')
    await database.checkpointAsset(second.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T11:01:00.000Z')
    expect(await database.activate(second.versionId, '2026-08-10T11:02:00.000Z')).toBe(first.versionId)
    expect(await database.getVersion(first.versionId)).toMatchObject({ state: 'retained' })

    expect(await database.markOpened(second.versionId, '2026-08-10T11:03:00.000Z')).toEqual([manifest.assets[0].url])
    expect(await database.getVersion(first.versionId)).toBeNull()
    expect(await database.isAssetOwned(manifest.assets[0].url)).toBe(true)
  })

  test('persists explicit resumable migration lifecycle state', async () => {
    const database = new OfflinePackDatabase()
    await database.setMigration({ id: manifest.packId, packId: manifest.packId, legacyVersionId: 'legacy:v1', targetVersionId: null, state: 'staging', error: null, updatedAt: 'now' })
    expect(await database.getMigration(manifest.packId)).toMatchObject({ state: 'staging', legacyVersionId: 'legacy:v1' })
    await database.setMigration({ id: manifest.packId, packId: manifest.packId, legacyVersionId: 'legacy:v1', targetVersionId: 'v2', state: 'failed', error: 'offline', updatedAt: 'later' })
    expect(await database.getMigration(manifest.packId)).toMatchObject({ state: 'failed', error: 'offline' })
    await database.setMigration({ id: manifest.packId, packId: manifest.packId, legacyVersionId: 'legacy:v1', targetVersionId: 'v2', state: 'opened', error: null, updatedAt: 'opened' })
    await database.setMigration({ id: manifest.packId, packId: manifest.packId, legacyVersionId: 'legacy:v1', targetVersionId: 'v2', state: 'activated', error: null, updatedAt: 'stale' })
    expect(await database.getMigration(manifest.packId)).toMatchObject({ state: 'opened', updatedAt: 'opened' })
  })

  test('atomically rolls back to the retained verified predecessor', async () => {
    const database = new OfflinePackDatabase()
    const first = await database.stage(withVersion('v2-a'), '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(first.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T10:01:00.000Z')
    await database.activate(first.versionId, '2026-08-10T10:02:00.000Z')
    const second = await database.stage(withVersion('v2-b'), '2026-08-10T11:00:00.000Z')
    await database.checkpointAsset(second.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T11:01:00.000Z')
    await database.activate(second.versionId, '2026-08-10T11:02:00.000Z')

    await database.rollback(second.versionId, '2026-08-10T11:03:00.000Z')

    expect((await database.getActivePack(manifest.packId))?.version.version).toBe('v2-a')
    expect(await database.getVersion(second.versionId)).toMatchObject({ state: 'rolled-back' })
  })

  test('atomically rolls back a first migrated v2 activation to the untouched legacy version', async () => {
    await seedLegacyPack()
    const database = new OfflinePackDatabase()
    await database.setMigration({
      id: manifest.packId, packId: manifest.packId, legacyVersionId: offlineVersionId(manifest.packId, 'v1'),
      targetVersionId: null, state: 'staging', error: null, updatedAt: 'now',
    })
    const staged = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(staged.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T10:01:00.000Z')
    await database.activate(staged.versionId, '2026-08-10T10:02:00.000Z')

    await database.rollback(staged.versionId, '2026-08-10T10:03:00.000Z')

    expect(await database.getVersion(staged.versionId)).toMatchObject({ state: 'rolled-back' })
    expect(await database.getMigration(manifest.packId)).toMatchObject({ state: 'rolled-back' })
    expect((await database.getActivePack(manifest.packId))?.version).toMatchObject({ version: 'v1', source: 'legacy' })
  })

  test('keeps the legacy pack visible and usable while v2 staging is interrupted', async () => {
    await seedLegacyPack()
    const database = new OfflinePackDatabase()
    const staged = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.failJob(staged.versionId, 'offline', '2026-08-10T10:01:00.000Z')

    expect((await database.listPacks())[0]).toMatchObject({ activeVersion: 'v1', legacySource: true, status: 'needs-repair', error: 'offline' })
    expect((await database.getActivePack(manifest.packId))?.version).toMatchObject({ version: 'v1', source: 'legacy' })
  })

  test('downgrades stored readiness when required ownership metadata disappears', async () => {
    const database = new OfflinePackDatabase()
    const staged = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(staged.versionId, manifest.assets[0].url, 3, manifest.assets[0].digest, '2026-08-10T10:01:00.000Z')
    await database.activate(staged.versionId, '2026-08-10T10:02:00.000Z')
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('letsboulder-offline-packs')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = connection.transaction('assets-v2', 'readwrite')
    transaction.objectStore('assets-v2').delete(`${staged.versionId}:${manifest.assets[0].url}`)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    connection.close()

    expect((await database.listPacks())[0]).toMatchObject({ status: 'needs-repair', error: 'Required offline metadata is missing or corrupt' })
  })
})
