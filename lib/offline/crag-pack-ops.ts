import pLimit from 'p-limit'
import type { ClimbOfflinePackManifest } from '@/features/climb/lib/queries'
import { fetchClimbOfflinePack, fetchCragOfflinePack } from '@/features/climb/lib/queries'
import {
  getOfflineCragPack,
  getOfflinePackUsageBytes,
  getStoredClimbManifest,
  getStoredCragManifest,
  listStoredClimbManifests,
  removePackRecord,
  removeStoredClimbManifest,
  removeStoredCragManifest,
  upsertPackRecord,
  upsertStoredClimbManifest,
  upsertStoredCragManifest,
} from '@/lib/offline/storage'
import { buildPackRecord, normalizeClimbManifest, normalizeCragManifest } from '@/lib/offline/manifest-normalizers'
import { sendServiceWorkerMessage, subscribeToOfflineJobProgress, type OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { OFFLINE_PACK_BUDGET_BYTES } from '@/lib/offline/pack-types'
import type { CragOfflinePreview, SaveCragOfflineResult } from '@/lib/offline/pack-types'

export async function getCragOfflinePreview(cragId: string): Promise<CragOfflinePreview> {
  const [manifest, existingPack, usageBytes] = await Promise.all([
    fetchCragOfflinePack(cragId),
    getOfflineCragPack(cragId),
    getOfflinePackUsageBytes(),
  ])

  let changedClimbs = 0
  let deltaBytes = 0
  for (const climb of manifest.climbs) {
    const existing = await getStoredClimbManifest(climb.climbId)
    if (existing?.manifest.version !== climb.versionHash) {
      changedClimbs += 1
      deltaBytes += climb.estimatedBytes
    }
  }

  return {
    manifest,
    existingPack,
    changedClimbs,
    deltaBytes,
    totalBytes: manifest.estimatedBytes,
    usageBytes,
    budgetBytes: OFFLINE_PACK_BUDGET_BYTES,
    isUpToDate: !!existingPack && existingPack.cragVersionHash === manifest.cragVersionHash,
    warning: manifest.warning || null,
  }
}

export async function saveCragOffline(
  cragId: string,
  onProgress?: (event: OfflineJobProgressEvent) => void
): Promise<SaveCragOfflineResult> {
  const preview = await getCragOfflinePreview(cragId)
  const existingPack = await getStoredCragManifest(cragId)
  const latestManifest = normalizeCragManifest(preview.manifest)

  if (preview.deltaBytes > 0 && (preview.usageBytes - (existingPack?.manifest.estimatedBytes || 0) + preview.deltaBytes) > preview.budgetBytes) {
    throw new Error('Not enough offline storage budget. Remove another pack first.')
  }

  const toFetch = [] as typeof latestManifest.climbs
  const existingClimbIds = new Set((existingPack?.manifest.climbs || []).map((climb) => climb.climbId))

  for (const climb of latestManifest.climbs) {
    const existing = await getStoredClimbManifest(climb.climbId)
    if (existing?.manifest.version !== climb.versionHash) {
      toFetch.push(climb)
    }
  }

  const limit = pLimit(3)
  const fetchedPayloads = await Promise.all(
    toFetch.map((climb) => limit(async () => fetchClimbOfflinePack(climb.climbId)))
  )

  const removedClimbIds = Array.from(existingClimbIds).filter(
    (existingClimbId) => !latestManifest.climbs.some((climb) => climb.climbId === existingClimbId)
  )

  const changedBytes = fetchedPayloads.reduce((sum, payload) => sum + payload.offline_pack.estimatedBytes, 0)
  const totalBytes = fetchedPayloads.reduce((sum, payload) => sum + payload.offline_pack.estimatedBytes, 0)
  const jobId = `crag-sync:${cragId}:${Date.now()}`
  const unsubscribe = onProgress ? subscribeToOfflineJobProgress(jobId, onProgress) : () => {}

  const swResponse = await sendServiceWorkerMessage({
    type: 'SAVE_CRAG_PACK',
    payload: {
      jobId,
      cragId,
      packId: latestManifest.packId,
      canonicalPath: latestManifest.canonicalPath,
      manifestUrl: latestManifest.manifestUrl,
      removedClimbIds,
      totalBytes,
      fallbackPath: `/crag/${cragId}`,
      climbs: fetchedPayloads.map((payload) => payload.offline_pack),
    },
  })

  if (!swResponse.ok) {
    unsubscribe()
    throw new Error(swResponse.error || 'Failed to save crag pack')
  }

  const completed = (async () => {
    try {
      for (const payload of fetchedPayloads) {
        const manifest = normalizeClimbManifest({ ...payload.offline_pack, type: 'climb' as const })
        const existing = await getStoredClimbManifest(manifest.climbId)
        const owners = new Set(existing?.ownerPackIds || [])
        owners.add(latestManifest.packId)

        await upsertStoredClimbManifest({
          climbId: manifest.climbId,
          manifest,
          payload,
          ownerPackIds: Array.from(owners),
          pinnedStandalone: existing?.pinnedStandalone || false,
          savedAt: existing?.savedAt || new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          lastAutoSyncAt: existing?.lastAutoSyncAt || null,
          priorityClass: existing?.priorityClass || null,
        })
      }

      for (const removedClimbId of removedClimbIds) {
        const existing = await getStoredClimbManifest(removedClimbId)
        if (!existing) continue
        const remainingOwners = existing.ownerPackIds.filter((ownerPackId) => ownerPackId !== latestManifest.packId)
        if (existing.pinnedStandalone || remainingOwners.length > 0) {
          await upsertStoredClimbManifest({
            ...existing,
            ownerPackIds: remainingOwners,
            lastUsedAt: new Date().toISOString(),
            lastAutoSyncAt: existing.lastAutoSyncAt || null,
          })
          continue
        }
        await removeStoredClimbManifest(removedClimbId)
      }

      await Promise.all([
        upsertPackRecord(buildPackRecord({
          packId: latestManifest.packId,
          type: 'crag',
          entityId: latestManifest.cragId,
          displayName: latestManifest.cragName,
          canonicalPath: latestManifest.canonicalPath,
          versionHash: latestManifest.cragVersionHash,
          estimatedBytes: latestManifest.estimatedBytes,
          mediaCount: latestManifest.mediaCount,
          coverImageUrl: latestManifest.savedPins?.[0]?.coverImageUrl || null,
          tileCount: 0,
          childClimbCount: latestManifest.climbCount,
        })),
        upsertStoredCragManifest({
          cragId,
          manifest: latestManifest,
          ownerPackIds: [latestManifest.packId],
          savedAt: existingPack?.savedAt || new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          lastAutoSyncAt: existingPack?.lastAutoSyncAt || null,
          priorityClass: existingPack?.priorityClass || null,
        }),
      ])
    } finally {
      unsubscribe()
    }
  })()

  return {
    preview: {
      ...preview,
      changedClimbs: preview.changedClimbs,
      deltaBytes: changedBytes || preview.deltaBytes,
    },
    unsubscribe,
    completed,
    warning: swResponse.warning,
  }
}

export async function removeCragOffline(cragId: string) {
  const existingCrag = await getStoredCragManifest(cragId)
  if (!existingCrag) return

  const allClimbManifests = await listStoredClimbManifests()
  const orphanClimbs: ClimbOfflinePackManifest[] = []
  const retainedMediaUrls = new Set<string>()

  for (const climb of allClimbManifests) {
    if (climb.ownerPackIds.includes(existingCrag.manifest.packId) && !climb.pinnedStandalone && climb.ownerPackIds.length === 1) {
      orphanClimbs.push(climb.manifest)
      continue
    }

    for (const mediaUrl of climb.manifest.mediaUrls) {
      retainedMediaUrls.add(mediaUrl)
    }
  }

  const orphanPayload = orphanClimbs.map((manifest) => ({
    ...manifest,
    mediaUrls: manifest.mediaUrls.filter((url) => !retainedMediaUrls.has(url)),
  }))

  const response = await sendServiceWorkerMessage({
    type: 'REMOVE_CRAG_PACK',
    payload: {
      packId: existingCrag.manifest.packId,
      canonicalPath: existingCrag.manifest.canonicalPath,
      fallbackPath: `/crag/${cragId}`,
      manifestUrl: existingCrag.manifest.manifestUrl,
      climbs: orphanPayload,
    },
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to remove crag pack')
  }

  for (const climb of allClimbManifests) {
    if (!climb.ownerPackIds.includes(existingCrag.manifest.packId)) continue
    const remainingOwners = climb.ownerPackIds.filter((ownerPackId) => ownerPackId !== existingCrag.manifest.packId)
    if (climb.pinnedStandalone || remainingOwners.length > 0) {
      await upsertStoredClimbManifest({
        ...climb,
        ownerPackIds: remainingOwners,
        lastUsedAt: new Date().toISOString(),
        lastAutoSyncAt: climb.lastAutoSyncAt || null,
      })
      continue
    }

    await removeStoredClimbManifest(climb.climbId)
  }

  await Promise.all([
    removeStoredCragManifest(cragId),
    removePackRecord(existingCrag.manifest.packId),
  ])
}
