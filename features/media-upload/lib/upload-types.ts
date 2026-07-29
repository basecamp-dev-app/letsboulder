import type { MediaStatusResponse } from '@/lib/media/types'

export const MAX_UPLOADS_PER_TARGET = 20
export const THUMBNAIL_MAX_WIDTH = 320

export type MediaUploadStatus = 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'PROCESSING' | 'MODERATING' | 'READY' | 'FAILED'

export const MEDIA_UPLOAD_STATUS_LABELS: Partial<Record<MediaUploadStatus, string>> = {
  PROCESSING: 'Uploaded, preparing photo',
  MODERATING: 'Checking photo safety',
  READY: 'Ready',
}

export function isMediaUploadPending(status: MediaUploadStatus) {
  return status === 'QUEUED'
    || status === 'PREPROCESSING'
    || status === 'UPLOADING'
    || status === 'PROCESSING'
    || status === 'MODERATING'
}

export function mapMediaUploadStatus(status: MediaStatusResponse): MediaUploadStatus {
  if (status.processingStatus === 'failed' || status.moderationStatus === 'rejected' || status.moderationStatus === 'error' || status.errorCode) {
    return 'FAILED'
  }
  if (status.processingStatus !== 'ready') return 'PROCESSING'
  if (status.moderationStatus === 'pending') return 'MODERATING'
  return 'READY'
}

export type MediaUploadTarget =
  | { kind: 'draft'; draftId: string }
  | { kind: 'crag'; cragId: string }

export interface MediaUploadItem {
  clientId: string
  target: MediaUploadTarget
  fileName: string
  status: MediaUploadStatus
  progress: number
  previewUrl: string
  width: number | null
  height: number | null
  uploadedImageId: string | null
  uploadedBucket: string | null
  uploadedPath: string | null
  gpsData: { latitude: number; longitude: number } | null
  captureDate: string | null
  error: string | null
  attachedRecordId: string | null
  startedAt: number
}

export interface QueueEntry {
  clientId: string
  target: MediaUploadTarget
  file: File
}

export interface DraftAttachResponse {
  error?: string
  code?: string
  current_updated_at?: string
  draft?: {
    updated_at?: string
    appended_image_ids?: string[]
  } | null
}

export interface CragAttachResponse {
  error?: string
  images?: Array<{ id?: string | null }>
}

export type UploadCompleteCallback = (target: MediaUploadTarget, clientId: string, attachedRecordId: string | null, newUpdatedAt?: string | null) => void

export function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function ensureFileName(file: Blob, fallbackName: string) {
  return file instanceof File ? file.name : fallbackName
}

export function isSameTarget(left: MediaUploadTarget, right: MediaUploadTarget) {
  if (left.kind !== right.kind) return false
  if (left.kind === 'draft' && right.kind === 'draft') {
    return left.draftId === right.draftId
  }
  if (left.kind === 'crag' && right.kind === 'crag') {
    return left.cragId === right.cragId
  }
  return false
}
