import { del, get, set } from 'idb-keyval'
import type { ClimbOfflinePackManifest, ClimbPackResponse, CragOfflinePackManifest } from '@/lib/climb/queries'

const LEGACY_CLIMB_PACKS_KEY = 'offline-climb-packs'
const PACK_RECORDS_KEY = 'offline-pack-records'
const CLIMB_MANIFESTS_KEY = 'offline-climb-manifests'
const CRAG_MANIFESTS_KEY = 'offline-crag-manifests'

export interface OfflinePackRecord {
  packId: string
  type: 'climb' | 'crag'
  entityId: string
  displayName: string
  canonicalPath: string
  versionHash: string
  estimatedBytes: number
  mediaCount: number
  savedAt: string
  lastSyncedAt: string
  syncState: 'idle' | 'syncing' | 'error'
}

export interface StoredClimbManifest {
  climbId: string
  manifest: ClimbOfflinePackManifest
  payload?: ClimbPackResponse
  ownerPackIds: string[]
  pinnedStandalone: boolean
  savedAt: string
  lastUsedAt: string
}

export interface StoredCragManifest {
  cragId: string
  manifest: CragOfflinePackManifest
  ownerPackIds: string[]
  savedAt: string
  lastUsedAt: string
}

type LegacyClimbPackMap = Record<string, ClimbOfflinePackManifest>

async function readMap<T>(key: string): Promise<Record<string, T>> {
  return (await get<Record<string, T>>(key)) || {}
}

async function writeMap<T>(key: string, value: Record<string, T>) {
  if (Object.keys(value).length === 0) {
    await del(key)
    return
  }

  await set(key, value)
}

async function migrateLegacyClimbPacks() {
  const legacy = await get<LegacyClimbPackMap>(LEGACY_CLIMB_PACKS_KEY)
  if (!legacy || typeof legacy !== 'object' || Object.keys(legacy).length === 0) {
    return
  }

  const packRecords = await readMap<OfflinePackRecord>(PACK_RECORDS_KEY)
  const climbManifests = await readMap<StoredClimbManifest>(CLIMB_MANIFESTS_KEY)
  const now = new Date().toISOString()

  for (const pack of Object.values(legacy)) {
    packRecords[pack.packId] = {
      packId: pack.packId,
      type: 'climb',
      entityId: pack.climbId,
      displayName: pack.climbName,
      canonicalPath: pack.canonicalPath || pack.pageUrl,
      versionHash: pack.version,
      estimatedBytes: pack.estimatedBytes,
      mediaCount: pack.mediaCount,
      savedAt: now,
      lastSyncedAt: now,
      syncState: 'idle',
    }

    climbManifests[pack.climbId] = {
      climbId: pack.climbId,
      manifest: {
        ...pack,
        type: 'climb',
      },
      ownerPackIds: [pack.packId],
      pinnedStandalone: true,
      savedAt: now,
      lastUsedAt: now,
    }
  }

  await Promise.all([
    writeMap(PACK_RECORDS_KEY, packRecords),
    writeMap(CLIMB_MANIFESTS_KEY, climbManifests),
    del(LEGACY_CLIMB_PACKS_KEY),
  ])
}

async function ensureOfflineStorageReady() {
  await migrateLegacyClimbPacks()
}

export async function listOfflinePackRecords(): Promise<OfflinePackRecord[]> {
  await ensureOfflineStorageReady()
  const records = await readMap<OfflinePackRecord>(PACK_RECORDS_KEY)
  return Object.values(records).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function getPackRecord(packId: string): Promise<OfflinePackRecord | null> {
  await ensureOfflineStorageReady()
  const records = await readMap<OfflinePackRecord>(PACK_RECORDS_KEY)
  return records[packId] || null
}

export async function upsertPackRecord(record: OfflinePackRecord) {
  await ensureOfflineStorageReady()
  const records = await readMap<OfflinePackRecord>(PACK_RECORDS_KEY)
  records[record.packId] = record
  await writeMap(PACK_RECORDS_KEY, records)
}

export async function removePackRecord(packId: string) {
  await ensureOfflineStorageReady()
  const records = await readMap<OfflinePackRecord>(PACK_RECORDS_KEY)
  delete records[packId]
  await writeMap(PACK_RECORDS_KEY, records)
}

export async function getStoredClimbManifest(climbId: string): Promise<StoredClimbManifest | null> {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredClimbManifest>(CLIMB_MANIFESTS_KEY)
  return manifests[climbId] || null
}

export async function listStoredClimbManifests(): Promise<StoredClimbManifest[]> {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredClimbManifest>(CLIMB_MANIFESTS_KEY)
  return Object.values(manifests)
}

export async function upsertStoredClimbManifest(entry: StoredClimbManifest) {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredClimbManifest>(CLIMB_MANIFESTS_KEY)
  manifests[entry.climbId] = entry
  await writeMap(CLIMB_MANIFESTS_KEY, manifests)
}

export async function removeStoredClimbManifest(climbId: string) {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredClimbManifest>(CLIMB_MANIFESTS_KEY)
  delete manifests[climbId]
  await writeMap(CLIMB_MANIFESTS_KEY, manifests)
}

export async function getStoredCragManifest(cragId: string): Promise<StoredCragManifest | null> {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredCragManifest>(CRAG_MANIFESTS_KEY)
  return manifests[cragId] || null
}

export async function upsertStoredCragManifest(entry: StoredCragManifest) {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredCragManifest>(CRAG_MANIFESTS_KEY)
  manifests[entry.cragId] = entry
  await writeMap(CRAG_MANIFESTS_KEY, manifests)
}

export async function removeStoredCragManifest(cragId: string) {
  await ensureOfflineStorageReady()
  const manifests = await readMap<StoredCragManifest>(CRAG_MANIFESTS_KEY)
  delete manifests[cragId]
  await writeMap(CRAG_MANIFESTS_KEY, manifests)
}

export async function getOfflinePackUsageBytes(): Promise<number> {
  const records = await listOfflinePackRecords()
  return records.reduce((sum, record) => sum + record.estimatedBytes, 0)
}

export async function getOfflineClimbPack(climbId: string): Promise<ClimbOfflinePackManifest | null> {
  const stored = await getStoredClimbManifest(climbId)
  return stored?.manifest || null
}

export async function getOfflineCragPack(cragId: string): Promise<CragOfflinePackManifest | null> {
  const stored = await getStoredCragManifest(cragId)
  return stored?.manifest || null
}
