import type { ClimbOfflinePackManifest } from '@/lib/climb/queries'
import { getOfflinePack, getOfflinePackUsageBytes, removeOfflinePack, upsertOfflinePack } from '@/lib/offline/storage'
import { sendServiceWorkerMessage } from '@/lib/offline/sw-messages'

export const OFFLINE_PACK_BUDGET_BYTES = 250 * 1024 * 1024

export interface OfflinePackStatus {
  pack: ClimbOfflinePackManifest | null
  usageBytes: number
  budgetBytes: number
}

export async function getOfflinePackStatus(climbId: string): Promise<OfflinePackStatus> {
  const [pack, usageBytes] = await Promise.all([
    getOfflinePack(climbId),
    getOfflinePackUsageBytes(),
  ])

  return {
    pack,
    usageBytes,
    budgetBytes: OFFLINE_PACK_BUDGET_BYTES,
  }
}

export async function saveClimbOfflinePack(pack: ClimbOfflinePackManifest) {
  const response = await sendServiceWorkerMessage({
    type: 'SAVE_CLIMB_PACK',
    payload: pack,
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to save offline pack')
  }

  await upsertOfflinePack(pack)
}

export async function deleteClimbOfflinePack(climbId: string) {
  const existing = await getOfflinePack(climbId)
  if (!existing) {
    return
  }

  const response = await sendServiceWorkerMessage({
    type: 'REMOVE_CLIMB_PACK',
    payload: existing,
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to remove offline pack')
  }

  await removeOfflinePack(climbId)
}
