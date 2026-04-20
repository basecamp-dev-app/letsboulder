'use client'

import { fetchClimbOfflinePack, fetchCragOfflinePack } from '@/features/climb/lib/queries'
import { saveClimbOfflinePack, saveCragOffline } from '@/lib/offline/packs'
import { isStoredClimbManifestFresh, isStoredCragManifestFresh } from '@/lib/offline/pack-status'
import { shouldEnableServiceWorker } from '@/lib/offline/service-worker-client'
import type { SavedClimb, SavedCrag } from '@/features/saved/lib/types'
import {
  getPackRecord,
  getStoredClimbManifest,
  getStoredCragManifest,
  upsertPackRecord,
  upsertStoredClimbManifest,
  upsertStoredCragManifest,
} from '@/lib/offline/storage'

const queuedClimbIds = new Set<string>()
const queuedCragIds = new Set<string>()

function runWhenIdle(task: () => void) {
  if (typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task())
    return
  }

  window.setTimeout(task, 250)
}

function schedulePriorityCandidates(savedClimbs: SavedClimb[], savedCrags: SavedCrag[]) {
  if (typeof window === 'undefined') return
  if (window.navigator.onLine === false) return
  if (!shouldEnableServiceWorker()) return

  for (const climb of savedClimbs) {
    if (!climb.climbId || queuedClimbIds.has(climb.climbId)) continue
    queuedClimbIds.add(climb.climbId)
  }

  for (const crag of savedCrags) {
    if (!crag.cragId || queuedCragIds.has(crag.cragId)) continue
    queuedCragIds.add(crag.cragId)
  }

  runWhenIdle(() => {
    void flushPriorityCandidates()
  })
}

async function flushPriorityCandidates() {
  if (typeof window === 'undefined') return
  if (window.navigator.onLine === false) return
  if (!shouldEnableServiceWorker()) return

  for (const cragId of Array.from(queuedCragIds)) {
    queuedCragIds.delete(cragId)
    try {
      const existingCrag = await getStoredCragManifest(cragId)
      if (existingCrag && existingCrag.priorityClass !== 'saved-crag') {
        await upsertStoredCragManifest({
          ...existingCrag,
          priorityClass: 'saved-crag',
        })
      }
      const latestManifest = await fetchCragOfflinePack(cragId)
      if (isStoredCragManifestFresh(existingCrag, latestManifest.cragVersionHash)) {
        continue
      }
      const result = await saveCragOffline(cragId)
      await result.completed
      const syncedAt = new Date().toISOString()
      const record = await getPackRecord(`crag:${cragId}`)
      if (record) {
        await upsertPackRecord({
          ...record,
          priorityClass: 'saved-crag',
          lastAutoSyncAt: syncedAt,
          lastAccessedAt: syncedAt,
        })
      }
      const refreshedCrag = await getStoredCragManifest(cragId)
      if (refreshedCrag) {
        await upsertStoredCragManifest({
          ...refreshedCrag,
          lastAutoSyncAt: syncedAt,
          priorityClass: 'saved-crag',
        })
      }
    } catch {
      // Best-effort prewarm only.
    }
  }

  for (const climbId of Array.from(queuedClimbIds)) {
    queuedClimbIds.delete(climbId)
    try {
      const existingClimb = await getStoredClimbManifest(climbId)
      if (existingClimb?.priorityClass !== 'saved-climb' && existingClimb) {
        await upsertStoredClimbManifest({
          ...existingClimb,
          priorityClass: 'saved-climb',
        })
      }
      const latestPayload = await fetchClimbOfflinePack(climbId)
      if (isStoredClimbManifestFresh(existingClimb, latestPayload.offline_pack.version)) {
        continue
      }
      await saveClimbOfflinePack(climbId)
      const syncedAt = new Date().toISOString()
      const record = await getPackRecord(`climb:${climbId}`)
      if (record) {
        await upsertPackRecord({
          ...record,
          priorityClass: 'saved-climb',
          lastAutoSyncAt: syncedAt,
          lastAccessedAt: syncedAt,
        })
      }
      const refreshedClimb = await getStoredClimbManifest(climbId)
      if (refreshedClimb) {
        await upsertStoredClimbManifest({
          ...refreshedClimb,
          lastAutoSyncAt: syncedAt,
          priorityClass: 'saved-climb',
        })
      }
    } catch {
      // Best-effort prewarm only.
    }
  }
}

export function syncPriorityOfflineCandidates(savedClimbs: SavedClimb[], savedCrags: SavedCrag[]) {
  schedulePriorityCandidates(savedClimbs, savedCrags)
}
