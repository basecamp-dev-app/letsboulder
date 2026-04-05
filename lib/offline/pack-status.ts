import type { ClimbOfflinePackManifest } from '@/features/climb/lib/queries'
import {
  getOfflineClimbPack,
  getOfflineCragPack,
  getOfflinePackUsageBytes,
  listOfflinePackRecords,
  listStoredCragManifests,
  listStoredClimbManifests,
} from '@/lib/offline/storage'
import { OFFLINE_PACK_BUDGET_BYTES, type OfflinePackStatus, type CragOfflineStatus } from '@/lib/offline/pack-types'

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
