import type { ClimbOfflinePackManifest, ClimbPackResponse } from '@/features/climb/lib/queries'
import { fetchClimbOfflinePack } from '@/features/climb/lib/queries'
import {
  getOfflinePackUsageBytes,
  getStoredClimbManifest,
  listOfflinePackRecords,
  removePackRecord,
  removeStoredClimbManifest,
  upsertPackRecord,
  upsertStoredClimbManifest,
} from '@/lib/offline/storage'
import { buildPackRecord, getClimbPackManifest, normalizeClimbManifest } from '@/lib/offline/manifest-normalizers'
import { OFFLINE_PACK_BUDGET_BYTES } from '@/lib/offline/pack-types'
import { isStoredClimbManifestFresh, sortOfflinePackEvictionCandidates } from '@/lib/offline/pack-status'
import { sendServiceWorkerMessage } from '@/lib/offline/sw-messages'

async function persistStandaloneClimbPack(payload: ClimbPackResponse) {
  const manifest = normalizeClimbManifest({
    ...payload.offline_pack,
    type: 'climb' as const,
  })
  const existing = await getStoredClimbManifest(manifest.climbId)
  const owners = new Set(existing?.ownerPackIds || [])
  owners.add(manifest.packId)
  const now = new Date().toISOString()

  await Promise.all([
    upsertPackRecord(buildPackRecord({
      packId: manifest.packId,
      type: 'climb',
      entityId: manifest.climbId,
      displayName: manifest.climbName,
      canonicalPath: manifest.canonicalPath || manifest.pageUrl,
      versionHash: manifest.version,
      estimatedBytes: manifest.estimatedBytes,
      mediaCount: manifest.mediaCount,
      coverImageUrl: manifest.coverImageUrl || null,
      tileCount: manifest.tileCount || 0,
      childClimbCount: 0,
      lastAutoSyncAt: existing?.lastAutoSyncAt || null,
      lastAccessedAt: now,
      priorityClass: existing?.priorityClass || null,
    })),
    upsertStoredClimbManifest({
      climbId: manifest.climbId,
      manifest,
      payload,
      ownerPackIds: Array.from(owners),
      pinnedStandalone: true,
      savedAt: existing?.savedAt || now,
      lastUsedAt: now,
      lastAutoSyncAt: existing?.lastAutoSyncAt || null,
      priorityClass: existing?.priorityClass || null,
    }),
  ])
}

export async function isStoredClimbPackCurrent(climbId: string) {
  const existing = await getStoredClimbManifest(climbId)
  if (!existing) return false

  return existing.manifest.version === existing.payload?.offline_pack.version
}

async function ensureOfflineBudgetForBytes(requiredBytes: number, currentPackId: string) {
  if (requiredBytes <= 0) return

  let usageBytes = await getOfflinePackUsageBytes()
  if (usageBytes + requiredBytes <= OFFLINE_PACK_BUDGET_BYTES) return

  const records = await listOfflinePackRecords()
  const candidates = sortOfflinePackEvictionCandidates(records)

  for (const candidate of candidates) {
    if (candidate.packId === currentPackId) continue

    if (candidate.type === 'crag') {
      const { removeCragOffline } = await import('@/lib/offline/crag-pack-ops')
      await removeCragOffline(candidate.entityId)
    } else {
      await deleteClimbOfflinePack(candidate.entityId)
    }

    usageBytes = await getOfflinePackUsageBytes()
    if (usageBytes + requiredBytes <= OFFLINE_PACK_BUDGET_BYTES) {
      return
    }
  }

  throw new Error('Not enough offline storage budget. Remove another pack first.')
}

export async function saveClimbOfflinePack(packOrPayload: string | ClimbOfflinePackManifest | ClimbPackResponse) {
  const payload = typeof packOrPayload === 'string'
    ? await fetchClimbOfflinePack(packOrPayload)
    : 'offline_pack' in packOrPayload
      ? packOrPayload
      : await fetchClimbOfflinePack(packOrPayload.climbId)
  const manifest = getClimbPackManifest(payload)
  const existing = await getStoredClimbManifest(manifest.climbId)

  if (isStoredClimbManifestFresh(existing, manifest.version)) {
    return { warning: undefined }
  }

  const existingBytes = existing?.manifest.estimatedBytes || 0
  const requiredBytes = Math.max(0, manifest.estimatedBytes - existingBytes)
  await ensureOfflineBudgetForBytes(requiredBytes, manifest.packId)

  const response = await sendServiceWorkerMessage({
    type: 'SAVE_CLIMB_PACK',
    payload: manifest,
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to save offline pack')
  }

  await persistStandaloneClimbPack(payload)
  return {
    warning: response.warning,
  }
}

export async function deleteClimbOfflinePack(climbId: string) {
  const existing = await getStoredClimbManifest(climbId)
  if (!existing) return

  const standalonePackId = `climb:${climbId}`
  const remainingOwners = existing.ownerPackIds.filter((ownerPackId) => ownerPackId !== standalonePackId)

  await removePackRecord(standalonePackId)

  if (remainingOwners.length > 0) {
    await upsertStoredClimbManifest({
      ...existing,
      ownerPackIds: remainingOwners,
      pinnedStandalone: false,
      lastUsedAt: new Date().toISOString(),
    })
    return
  }

  const allCrags = await getStoredCragManifests()
  const retainedTileUrls = new Set<string>()
  for (const crag of allCrags) {
    for (const tileUrl of crag.manifest.tileManifest?.tileUrls || []) {
      retainedTileUrls.add(tileUrl)
    }
  }

  const response = await sendServiceWorkerMessage({
    type: 'REMOVE_CLIMB_PACK',
    payload: {
      ...existing.manifest,
      tileUrls: (existing.manifest.tileUrls || []).filter((url) => !retainedTileUrls.has(url)),
    },
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to remove offline pack')
  }

  await removeStoredClimbManifest(climbId)
}

async function getStoredCragManifests() {
  const { listStoredCragManifests } = await import('@/lib/offline/storage')
  return listStoredCragManifests()
}
