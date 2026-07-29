import { createStore, del, get, set } from 'idb-keyval'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

const CHECKPOINT_SCHEMA_VERSION = 1
const checkpointStore = createStore('letsboulder-draft-editor', 'geometry-checkpoints')

export interface DraftEditorCheckpoint {
  schemaVersion: 1
  revision: number
  serverUpdatedAt: string
  routesByImageId: Record<string, DraftRoute[]>
  sectorId: string | null
}

export function canRestoreDraftEditorCheckpoint(
  checkpoint: DraftEditorCheckpoint,
  serverRevision: { updatedAt: string; lastEditedBy: string | null },
  currentUserId: string,
): boolean {
  return checkpoint.serverUpdatedAt === serverRevision.updatedAt
    || serverRevision.lastEditedBy === currentUserId
}

function checkpointKey(userId: string, draftId: string): string {
  return `${userId}:${draftId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDraftRoute(value: unknown): value is DraftRoute {
  if (!isRecord(value) || !Array.isArray(value.points)) return false
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.grade === 'string'
    && typeof value.sequenceOrder === 'number'
    && typeof value.imageWidth === 'number'
    && typeof value.imageHeight === 'number'
    && value.points.every((point) => isRecord(point) && typeof point.x === 'number' && typeof point.y === 'number')
}

function isDraftEditorCheckpoint(value: unknown): value is DraftEditorCheckpoint {
  if (!isRecord(value) || !isRecord(value.routesByImageId)) return false
  return value.schemaVersion === CHECKPOINT_SCHEMA_VERSION
    && typeof value.revision === 'number'
    && Number.isSafeInteger(value.revision)
    && value.revision > 0
    && typeof value.serverUpdatedAt === 'string'
    && (value.sectorId === null || typeof value.sectorId === 'string')
    && Object.values(value.routesByImageId).every((routes) => Array.isArray(routes) && routes.every(isDraftRoute))
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function readDraftEditorCheckpoint(userId: string, draftId: string): Promise<DraftEditorCheckpoint | null> {
  if (!canUseIndexedDb()) return null
  const key = checkpointKey(userId, draftId)
  try {
    const value: unknown = await get(key, checkpointStore)
    if (value === undefined) return null
    if (isDraftEditorCheckpoint(value)) return value
    await del(key, checkpointStore)
  } catch {
    // Private browsing and storage policies can make IndexedDB unavailable.
  }
  return null
}

export async function writeDraftEditorCheckpoint(userId: string, draftId: string, checkpoint: DraftEditorCheckpoint): Promise<void> {
  if (!canUseIndexedDb() || !isDraftEditorCheckpoint(checkpoint)) return
  try {
    await set(checkpointKey(userId, draftId), checkpoint, checkpointStore)
  } catch {
    // Checkpointing is best effort and must not interrupt editing.
  }
}

export async function clearDraftEditorCheckpoint(userId: string, draftId: string, revision: number): Promise<void> {
  if (!canUseIndexedDb()) return
  const key = checkpointKey(userId, draftId)
  try {
    const value: unknown = await get(key, checkpointStore)
    if (isDraftEditorCheckpoint(value) && value.revision === revision) {
      await del(key, checkpointStore)
    }
  } catch {
    // Checkpointing is best effort and must not interrupt a successful save.
  }
}
