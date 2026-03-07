import pLimit from 'p-limit'
import type { ClimbOfflinePackManifest, ClimbPackResponse, CragOfflinePackManifest } from '@/lib/climb/queries'
import { fetchClimbOfflinePack, fetchCragOfflinePack } from '@/lib/climb/queries'
import {
  getOfflineClimbPack,
  getOfflineCragPack,
  getOfflinePackUsageBytes,
  getStoredClimbManifest,
  getStoredCragManifest,
  listOfflinePackRecords,
  listStoredCragManifests,
  listStoredClimbManifests,
  removePackRecord,
  removeStoredClimbManifest,
  removeStoredCragManifest,
  upsertPackRecord,
  upsertStoredClimbManifest,
  upsertStoredCragManifest,
  type OfflinePackRecord,
} from '@/lib/offline/storage'
import { sendServiceWorkerMessage, subscribeToOfflineJobProgress, type OfflineJobProgressEvent } from '@/lib/offline/sw-messages'

export const OFFLINE_PACK_BUDGET_BYTES = 250 * 1024 * 1024

export interface OfflinePackStatus {
  pack: ClimbOfflinePackManifest | null
  usageBytes: number
  budgetBytes: number
}

export interface CragOfflineStatus {
  pack: CragOfflinePackManifest | null
  usageBytes: number
  budgetBytes: number
}

export interface CragOfflinePreview {
  manifest: CragOfflinePackManifest
  existingPack: CragOfflinePackManifest | null
  changedClimbs: number
  deltaBytes: number
  totalBytes: number
  usageBytes: number
  budgetBytes: number
  isUpToDate: boolean
  warning?: string | null
}

interface SaveCragOfflineResult {
  preview: CragOfflinePreview
  unsubscribe: () => void
  completed: Promise<void>
}

function buildPackRecord(input: {
  packId: string
  type: 'climb' | 'crag'
  entityId: string
  displayName: string
  canonicalPath: string
  versionHash: string
  estimatedBytes: number
  mediaCount: number
  coverImageUrl?: string | null
  tileCount?: number
  childClimbCount?: number
}): OfflinePackRecord {
  const now = new Date().toISOString()
  return {
    ...input,
    savedAt: now,
    lastSyncedAt: now,
    syncState: 'idle',
  }
}

function getClimbPackManifest(packOrPayload: ClimbOfflinePackManifest | ClimbPackResponse) {
  return 'offline_pack' in packOrPayload ? packOrPayload.offline_pack : packOrPayload
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

async function persistStandaloneClimbPack(payload: ClimbPackResponse) {
  const manifest = {
    ...payload.offline_pack,
    type: 'climb' as const,
  }
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
    })),
    upsertStoredClimbManifest({
      climbId: manifest.climbId,
      manifest,
      payload,
      ownerPackIds: Array.from(owners),
      pinnedStandalone: true,
      savedAt: existing?.savedAt || now,
      lastUsedAt: now,
    }),
  ])
}

export async function saveClimbOfflinePack(packOrPayload: ClimbOfflinePackManifest | ClimbPackResponse) {
  const payload = 'offline_pack' in packOrPayload
    ? packOrPayload
    : await fetchClimbOfflinePack(packOrPayload.climbId)
  const manifest = getClimbPackManifest(payload)

  const response = await sendServiceWorkerMessage({
    type: 'SAVE_CLIMB_PACK',
    payload: manifest,
  })

  if (!response.ok) {
    throw new Error(response.error || 'Failed to save offline pack')
  }

  await persistStandaloneClimbPack(payload)
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

  const [allClimbs, allCrags] = await Promise.all([listStoredClimbManifests(), listStoredCragManifests()])
  const retainedTileUrls = new Set<string>()
  for (const climb of allClimbs) {
    if (climb.climbId === climbId) continue
    for (const tileUrl of climb.manifest.tileUrls || []) {
      retainedTileUrls.add(tileUrl)
    }
  }
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
  const latestManifest = preview.manifest

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
      tileUrls: latestManifest.tileManifest?.tileUrls || [],
      removedClimbIds,
      totalBytes,
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
        const manifest = { ...payload.offline_pack, type: 'climb' as const }
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
          tileCount: latestManifest.tileManifest?.tileCount || 0,
          childClimbCount: latestManifest.climbCount,
        })),
        upsertStoredCragManifest({
          cragId,
          manifest: latestManifest,
          ownerPackIds: [latestManifest.packId],
          savedAt: existingPack?.savedAt || new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
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
  }
}

export async function removeCragOffline(cragId: string) {
  const existingCrag = await getStoredCragManifest(cragId)
  if (!existingCrag) return

  const [allClimbManifests, allCragManifests] = await Promise.all([listStoredClimbManifests(), listStoredCragManifests()])
  const orphanClimbs: ClimbOfflinePackManifest[] = []
  const retainedMediaUrls = new Set<string>()
  const retainedTileUrls = new Set<string>()

  for (const climb of allClimbManifests) {
    if (climb.ownerPackIds.includes(existingCrag.manifest.packId) && !climb.pinnedStandalone && climb.ownerPackIds.length === 1) {
      orphanClimbs.push(climb.manifest)
      continue
    }

    for (const mediaUrl of climb.manifest.mediaUrls) {
      retainedMediaUrls.add(mediaUrl)
    }

    for (const tileUrl of climb.manifest.tileUrls || []) {
      retainedTileUrls.add(tileUrl)
    }
  }

  for (const crag of allCragManifests) {
    if (crag.cragId === cragId) continue
    for (const tileUrl of crag.manifest.tileManifest?.tileUrls || []) {
      retainedTileUrls.add(tileUrl)
    }
  }

  const orphanPayload = orphanClimbs.map((manifest) => ({
    ...manifest,
    mediaUrls: manifest.mediaUrls.filter((url) => !retainedMediaUrls.has(url)),
    tileUrls: (manifest.tileUrls || []).filter((url) => !retainedTileUrls.has(url)),
  }))

  const response = await sendServiceWorkerMessage({
    type: 'REMOVE_CRAG_PACK',
    payload: {
      packId: existingCrag.manifest.packId,
      canonicalPath: existingCrag.manifest.canonicalPath,
      manifestUrl: existingCrag.manifest.manifestUrl,
      tileUrls: (existingCrag.manifest.tileManifest?.tileUrls || []).filter((url) => !retainedTileUrls.has(url)),
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
