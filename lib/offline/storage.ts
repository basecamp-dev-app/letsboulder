import { del, get, set } from 'idb-keyval'
import type { ClimbOfflinePackManifest } from '@/lib/climb/queries'

const OFFLINE_PACKS_KEY = 'offline-climb-packs'

type OfflinePackMap = Record<string, ClimbOfflinePackManifest>

async function readAll(): Promise<OfflinePackMap> {
  return (await get<OfflinePackMap>(OFFLINE_PACKS_KEY)) || {}
}

async function writeAll(value: OfflinePackMap) {
  await set(OFFLINE_PACKS_KEY, value)
}

export async function upsertOfflinePack(pack: ClimbOfflinePackManifest) {
  const current = await readAll()
  current[pack.climbId] = pack
  await writeAll(current)
}

export async function getOfflinePack(climbId: string): Promise<ClimbOfflinePackManifest | null> {
  const current = await readAll()
  return current[climbId] || null
}

export async function removeOfflinePack(climbId: string) {
  const current = await readAll()
  delete current[climbId]

  if (Object.keys(current).length === 0) {
    await del(OFFLINE_PACKS_KEY)
    return
  }

  await writeAll(current)
}

export async function getOfflinePackUsageBytes(): Promise<number> {
  const current = await readAll()
  return Object.values(current).reduce((sum, pack) => sum + pack.estimatedBytes, 0)
}
