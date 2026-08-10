import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { OfflinePackDatabase, offlineVersionId } from '@/features/offline/lib/offline-pack-database'
import type { OfflinePackManifest } from '@/features/offline/lib/offline-pack-types'

const manifest: OfflinePackManifest = {
  packId: 'crag:db-test', kind: 'crag', entityId: 'db-test', displayName: 'Database Crag',
  version: 'v1', manifestUrl: '/manifest', estimatedBytes: 3,
  assets: [{ url: 'https://cdn.example/topo.webp', estimatedBytes: 3, mediaType: 'image/webp' }],
  dependentManifestUrls: [], payload: { type: 'crag' },
}

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('letsboulder-offline-packs')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe('OfflinePackDatabase with IndexedDB', () => {
  beforeEach(async () => { await deleteDatabase() })

  test('stages, checkpoints, activates, and records the successful update', async () => {
    const database = new OfflinePackDatabase()
    const job = await database.stage(manifest, '2026-08-10T10:00:00.000Z')
    await database.checkpointAsset(job.versionId, manifest.assets[0].url, 3, '2026-08-10T10:01:00.000Z')
    expect(await database.activate(job.versionId, '2026-08-10T10:02:00.000Z')).toBeNull()

    const active = await database.getActivePack(manifest.packId)
    expect(active?.pack).toMatchObject({ activeVersion: 'v1', status: 'ready', lastSuccessfulUpdateAt: '2026-08-10T10:02:00.000Z' })
    expect((await database.listJobs())[0]).toMatchObject({ state: 'complete', completedAssets: 1, downloadedBytes: 3 })
    expect((await database.listVersionAssets(offlineVersionId(manifest.packId, 'v1')))[0]).toMatchObject({ state: 'cached', downloadedBytes: 3 })
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
})
