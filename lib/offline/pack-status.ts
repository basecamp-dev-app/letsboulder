import {
  getOfflineClimbPack,
  getOfflineCragPack,
  getOfflinePackUsageBytes,
  listOfflinePackRecords,
  listStoredCragManifests,
  listStoredClimbManifests,
  type OfflinePackRecord,
  type StoredClimbManifest,
  type StoredCragManifest,
} from '@/lib/offline/storage'
import { OFFLINE_PACK_BUDGET_BYTES, type OfflinePackStatus, type CragOfflineStatus } from '@/lib/offline/pack-types'

export function isStoredClimbManifestFresh(stored: StoredClimbManifest | null, latestVersionHash: string) {
  return stored?.manifest.version === latestVersionHash
}

export function isStoredCragManifestFresh(stored: StoredCragManifest | null, latestVersionHash: string) {
  return stored?.manifest.cragVersionHash === latestVersionHash
}

export function sortOfflinePackEvictionCandidates(records: OfflinePackRecord[]) {
  return [...records]
    .filter((record) => !record.priorityClass)
    .sort((a, b) => {
      const aLastTouched = a.lastAccessedAt || a.lastSyncedAt || a.savedAt
      const bLastTouched = b.lastAccessedAt || b.lastSyncedAt || b.savedAt

      if (aLastTouched !== bLastTouched) {
        return aLastTouched.localeCompare(bLastTouched)
      }

      return a.estimatedBytes - b.estimatedBytes
    })
}

export async function getOfflinePackStatus(climbId: string): Promise<OfflinePackStatus> {
  const [pack, usageBytes] = await Promise.all([
    getOfflineClimbPack(climbId),
    getOfflinePackUsageBytes(),
  ])

  return {
    pack,
    usageBytes,
    budgetBytes: OFFLINE_PACK_BUDGET_BYTES,
  }
}

export async function hasOfflineLaunchPacks(): Promise<boolean> {
  const [crags, climbs] = await Promise.all([
    listStoredCragManifests(),
    listStoredClimbManifests(),
  ])
  return crags.length > 0 || climbs.some((entry) => entry.pinnedStandalone)
}

export async function getCragOfflineStatus(cragId: string): Promise<CragOfflineStatus> {
  const [pack, usageBytes] = await Promise.all([
    getOfflineCragPack(cragId),
    getOfflinePackUsageBytes(),
  ])

  return {
    pack,
    usageBytes,
    budgetBytes: OFFLINE_PACK_BUDGET_BYTES,
  }
}

export async function listOfflinePacksForLaunch() {
  const [records, climbs, crags] = await Promise.all([
    listOfflinePackRecords(),
    listStoredClimbManifests(),
    listStoredCragManifests(),
  ])

  return {
    records,
    climbs,
    crags,
  }
}
