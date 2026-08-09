import { createStore, del, get, set, values } from 'idb-keyval'
import type { MediaUploadItem, QueueEntry } from '@/features/media-upload/lib/upload-types'
import { uploadDebugError } from '@/lib/media/upload-debug'

const metadataStore = createStore('letsboulder-contributions', 'media-queue')
const blobStore = createStore('letsboulder-contributions', 'media-blobs')

interface PersistedUploadMetadata {
  schemaVersion: 1 | 2
  userId: string
  item: Omit<MediaUploadItem, 'previewUrl'>
  lastModified: number
}

export interface RestoredUpload {
  item: MediaUploadItem
  entry: QueueEntry
}

function key(userId: string, clientId: string) {
  return `${userId}:${clientId}`
}

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function isMetadata(value: unknown): value is PersistedUploadMetadata {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PersistedUploadMetadata>
  return (candidate.schemaVersion === 1 || candidate.schemaVersion === 2)
    && typeof candidate.userId === 'string'
    && typeof candidate.lastModified === 'number'
    && Boolean(candidate.item && typeof candidate.item.clientId === 'string')
}

export async function persistNewUpload(userId: string, item: MediaUploadItem, file: File): Promise<boolean> {
  if (!canUseIndexedDb()) return false
  const storageKey = key(userId, item.clientId)
  const persistedItem = { ...item, previewUrl: undefined }
  const [previousBlob, previousMetadata] = await Promise.all([
    get<Blob>(storageKey, blobStore).catch(() => undefined),
    get<unknown>(storageKey, metadataStore).catch(() => undefined),
  ])
  try {
    await set(storageKey, file, blobStore)
    delete persistedItem.previewUrl
    await set(storageKey, { schemaVersion: 2, userId, item: persistedItem, lastModified: file.lastModified } satisfies PersistedUploadMetadata, metadataStore)
    return true
  } catch (error) {
    uploadDebugError('indexeddb-persist-failed', error, {
      clientId: item.clientId,
      fileName: item.fileName,
      fileSize: file.size,
      fileType: file.type,
    })
    await Promise.all([
      previousBlob === undefined
        ? del(storageKey, blobStore).catch(() => undefined)
        : set(storageKey, previousBlob, blobStore).catch(() => undefined),
      previousMetadata === undefined
        ? del(storageKey, metadataStore).catch(() => undefined)
        : set(storageKey, previousMetadata, metadataStore).catch(() => undefined),
    ])
    return false
  }
}

export async function persistUploadMetadata(userId: string, item: MediaUploadItem): Promise<void> {
  if (!canUseIndexedDb()) return
  const storageKey = key(userId, item.clientId)
  try {
    const current: unknown = await get(storageKey, metadataStore)
    if (!isMetadata(current)) return
    const persistedItem = { ...item, previewUrl: undefined }
    delete persistedItem.previewUrl
    await set(storageKey, { ...current, item: persistedItem }, metadataStore)
  } catch {
    // The in-memory queue remains usable when browser storage becomes unavailable.
  }
}

export async function removePersistedUpload(userId: string, clientId: string): Promise<void> {
  if (!canUseIndexedDb()) return
  const storageKey = key(userId, clientId)
  await Promise.all([
    del(storageKey, metadataStore).catch(() => undefined),
    del(storageKey, blobStore).catch(() => undefined),
  ])
}

export async function restoreUploads(userId: string): Promise<RestoredUpload[]> {
  if (!canUseIndexedDb()) return []
  try {
    const records: unknown[] = await values(metadataStore)
    const restored = await Promise.all(records.filter(isMetadata).filter((record) => record.userId === userId).map(async (record) => {
      const blob = await get<Blob>(key(userId, record.item.clientId), blobStore)
      if (!(blob instanceof Blob)) return null
      const file = new File([blob], record.item.fileName, { type: blob.type, lastModified: record.lastModified })
      const item: MediaUploadItem = {
        ...record.item,
        missingExif: record.item.missingExif ?? record.item.gpsData === null,
        status: record.item.status === 'READY' ? 'READY' : 'QUEUED',
        progress: record.item.status === 'READY' ? 100 : 0,
        error: null,
        previewUrl: URL.createObjectURL(blob),
      }
      return { item, entry: { clientId: item.clientId, target: item.target, file, isPrepared: record.schemaVersion === 2 } }
    }))
    return restored.filter((record): record is RestoredUpload => record !== null)
  } catch {
    return []
  }
}
