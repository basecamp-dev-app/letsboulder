'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import imageCompression from 'browser-image-compression'
import { csrfFetch } from '@/hooks/useCsrf'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { extractGpsFromFile } from '@/lib/image-gps'
import { stripExifMetadataFromFile } from '@/lib/image-metadata'
import { isHeicFile } from '@/lib/image-utils'
import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, uploadFileToMediaSession } from '@/lib/media/client-upload'

const MAX_UPLOADS_PER_TARGET = 20
const SKIP_COMPRESSION_THRESHOLD_BYTES = 1024 * 1024
const THUMBNAIL_MAX_WIDTH = 320

export type MediaUploadStatus = 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'

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

interface QueueEntry {
  clientId: string
  target: MediaUploadTarget
  file: File
}

interface DraftAttachResponse {
  error?: string
  code?: string
  current_updated_at?: string
  draft?: {
    updated_at?: string
    appended_image_ids?: string[]
  } | null
}

interface CragAttachResponse {
  error?: string
  images?: Array<{ id?: string | null }>
}

interface MediaUploadManagerValue {
  uploads: MediaUploadItem[]
  activeClientId: string | null
  isPaused: boolean
  queueUploads: (files: File[], target: MediaUploadTarget) => void
  getUploadsForDraft: (draftId: string) => MediaUploadItem[]
  getUploadsForCrag: (cragId: string) => MediaUploadItem[]
  retryUpload: (clientId: string) => void
  removeUpload: (clientId: string) => Promise<void>
  hasPendingUploads: (target: MediaUploadTarget) => boolean
  hasFailedUploads: (target: MediaUploadTarget) => boolean
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  resumeQueue: () => void
  isQueuePaused: (target?: MediaUploadTarget) => boolean
  getActiveUpload: (target: MediaUploadTarget) => MediaUploadItem | null
}

const MediaUploadManagerContext = createContext<MediaUploadManagerValue | null>(null)

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `media-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ensureFileName(file: Blob, fallbackName: string) {
  return file instanceof File ? file.name : fallbackName
}

function isSameTarget(left: MediaUploadTarget, right: MediaUploadTarget) {
  if (left.kind !== right.kind) return false
  if (left.kind === 'draft' && right.kind === 'draft') {
    return left.draftId === right.draftId
  }
  if (left.kind === 'crag' && right.kind === 'crag') {
    return left.cragId === right.cragId
  }
  return false
}

async function getImageDimensions(source: Blob) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const objectUrl = URL.createObjectURL(source)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: image.naturalWidth || 1200, height: image.naturalHeight || 1200 })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: 1200, height: 1200 })
    }
    image.src = objectUrl
  })
}

async function buildPreviewUrl(file: File) {
  const previewBlob = await imageCompression(file, {
    maxWidthOrHeight: THUMBNAIL_MAX_WIDTH,
    initialQuality: 0.7,
    fileType: 'image/jpeg',
    useWebWorker: true,
  }).catch(() => file)

  return URL.createObjectURL(previewBlob)
}

async function preprocessFile(file: File) {
  const normalizedFile = isHeicFile(file)
    ? new File([await convertHeicToJpegBlob(file)], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    : file

  const shouldCompress = normalizedFile.size > SKIP_COMPRESSION_THRESHOLD_BYTES || isHeicFile(file)
  const maybeCompressed = shouldCompress
    ? await imageCompression(normalizedFile, {
        maxWidthOrHeight: 1600,
        initialQuality: 0.75,
        fileType: 'image/jpeg',
        useWebWorker: true,
      })
    : normalizedFile

  return stripExifMetadataFromFile(maybeCompressed)
}

export function MediaUploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Record<string, MediaUploadItem>>({})
  const [queueOrder, setQueueOrder] = useState<string[]>([])
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const queueEntriesRef = useRef<Map<string, QueueEntry>>(new Map())
  const draftUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const processingClientIdsRef = useRef<Set<string>>(new Set())

  const uploadsRef = useRef(uploads)

  useEffect(() => { uploadsRef.current = uploads }, [uploads])

  const uploadsList = useMemo(() => Object.values(uploads).sort((a, b) => a.startedAt - b.startedAt), [uploads])

  const updateUpload = useCallback((clientId: string, updater: (current: MediaUploadItem) => MediaUploadItem) => {
    setUploads((current) => {
      const existing = current[clientId]
      if (!existing) return current
      return { ...current, [clientId]: updater(existing) }
    })
  }, [])

  const revokePreviewUrl = useCallback((clientId: string) => {
    const upload = uploadsRef.current[clientId]
    if (!upload || !upload.previewUrl.startsWith('blob:')) return
    URL.revokeObjectURL(upload.previewUrl)
    setUploads((current) => {
      const existing = current[clientId]
      if (!existing || !existing.previewUrl.startsWith('blob:')) return current
      return { ...current, [clientId]: { ...existing, previewUrl: '' } }
    })
  }, [])

  const registerDraftUpdatedAt = useCallback((draftId: string, updatedAt: string) => {
    draftUpdatedAtRef.current.set(draftId, updatedAt)
  }, [])

  const getUploadsForDraft = useCallback((draftId: string) => {
    return uploadsList.filter((upload) => upload.target.kind === 'draft' && upload.target.draftId === draftId)
  }, [uploadsList])

  const getUploadsForCrag = useCallback((cragId: string) => {
    return uploadsList.filter((upload) => upload.target.kind === 'crag' && upload.target.cragId === cragId)
  }, [uploadsList])

  const getActiveUpload = useCallback((target: MediaUploadTarget) => {
    if (!activeClientId) return null
    const upload = uploads[activeClientId] || null
    if (!upload || !isSameTarget(upload.target, target)) return null
    return upload
  }, [activeClientId, uploads])

  const isQueuePaused = useCallback((target?: MediaUploadTarget) => {
    if (!isPaused) return false
    if (!target) return true
    const activeUpload = activeClientId ? uploads[activeClientId] : null
    if (activeUpload && isSameTarget(activeUpload.target, target)) return true
    return queueOrder.some((clientId) => {
      const upload = uploads[clientId]
      return upload ? isSameTarget(upload.target, target) : false
    })
  }, [activeClientId, isPaused, queueOrder, uploads])

  const hasPendingUploads = useCallback((target: MediaUploadTarget) => {
    const matching = target.kind === 'draft' ? getUploadsForDraft(target.draftId) : getUploadsForCrag(target.cragId)
    return matching.some((upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING')
  }, [getUploadsForCrag, getUploadsForDraft])

  const hasFailedUploads = useCallback((target: MediaUploadTarget) => {
    const matching = target.kind === 'draft' ? getUploadsForDraft(target.draftId) : getUploadsForCrag(target.cragId)
    return matching.some((upload) => upload.status === 'FAILED')
  }, [getUploadsForCrag, getUploadsForDraft])

  const attachUpload = useCallback(async (clientId: string) => {
    const upload = uploadsRef.current[clientId]
    if (!upload || !upload.uploadedBucket || !upload.uploadedPath || !upload.uploadedImageId) {
      throw new Error('Upload is not ready to attach yet')
    }

    if (upload.target.kind === 'draft') {
      let attempts = 0
      while (attempts < 2) {
        attempts += 1
        const expectedUpdatedAt = draftUpdatedAtRef.current.get(upload.target.draftId)
        if (!expectedUpdatedAt) {
          throw new Error('Draft is not ready to receive uploads yet')
        }

        const response = await csrfFetch(`/api/submissions/drafts/${upload.target.draftId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expected_updated_at: expectedUpdatedAt,
            images: [{
              storage_bucket: upload.uploadedBucket,
              storage_path: upload.uploadedPath,
              gps_data: upload.gpsData,
              capture_date: upload.captureDate,
              width: upload.width,
              height: upload.height,
              route_data: {},
            }],
          }),
        })

        const payload = await response.json().catch(() => ({} as DraftAttachResponse))
        if (response.ok) {
          if (payload.draft?.updated_at) {
            draftUpdatedAtRef.current.set(upload.target.draftId, payload.draft.updated_at)
          }
          const attachedRecordId = Array.isArray(payload.draft?.appended_image_ids) ? payload.draft?.appended_image_ids[0] || null : null
          updateUpload(clientId, (current) => ({ ...current, status: 'SUCCESS', progress: 100, error: null, attachedRecordId }))
          revokePreviewUrl(clientId)
          return
        }

        if (response.status === 409 && payload.code === 'draft_conflict' && payload.current_updated_at) {
          draftUpdatedAtRef.current.set(upload.target.draftId, payload.current_updated_at)
          continue
        }

        throw new Error(payload.error || 'Failed to attach upload to draft')
      }

      throw new Error('Draft changed while attaching upload. Please retry.')
    }

    const response = await csrfFetch(`/api/crags/${upload.target.cragId}/images/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [{ uploaded_image_id: upload.uploadedImageId }] }),
    })
    const payload = await response.json().catch(() => ({} as CragAttachResponse))
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to attach upload to crag')
    }
    const attachedRecordId = Array.isArray(payload.images) ? payload.images[0]?.id || null : null
    updateUpload(clientId, (current) => ({ ...current, status: 'SUCCESS', progress: 100, error: null, attachedRecordId }))
    revokePreviewUrl(clientId)
  }, [revokePreviewUrl, updateUpload])

  const processActiveEntry = useCallback(async (entry: QueueEntry) => {
    const abortController = new AbortController()
    activeAbortControllerRef.current = abortController
    let uploadSessionImageId: string | null = null

    try {
      updateUpload(entry.clientId, (current) => ({ ...current, status: 'PREPROCESSING', progress: 10, error: null }))

      const [preparedFile, gpsData] = await Promise.all([
        preprocessFile(entry.file),
        extractGpsFromFile(entry.file),
      ])
      const dimensions = await getImageDimensions(preparedFile)

      updateUpload(entry.clientId, (current) => ({
        ...current,
        status: 'UPLOADING',
        progress: 35,
        gpsData,
        width: dimensions.width,
        height: dimensions.height,
      }))

      const uploadSession = await createMediaUploadSession({
        purpose: entry.target.kind === 'draft' ? 'draft_image' : 'crag_image',
        contentType: preparedFile.type || 'image/jpeg',
        fileName: ensureFileName(preparedFile, entry.file.name),
        byteSize: preparedFile.size,
        draftId: entry.target.kind === 'draft' ? entry.target.draftId : undefined,
        cragId: entry.target.kind === 'crag' ? entry.target.cragId : undefined,
      }, abortController.signal)
      uploadSessionImageId = uploadSession.imageId

      updateUpload(entry.clientId, (current) => ({
        ...current,
        progress: 55,
        uploadedImageId: uploadSession.imageId,
        uploadedBucket: uploadSession.bucket,
        uploadedPath: uploadSession.objectKey,
      }))

      await uploadFileToMediaSession(uploadSession.uploadUrl, uploadSession.uploadHeaders, preparedFile, abortController.signal)
      updateUpload(entry.clientId, (current) => ({ ...current, progress: 80 }))

      await completeMediaUploadSession(uploadSession.imageId, entry.target.kind === 'draft' ? 'draft_image' : 'crag_image', abortController.signal)
      updateUpload(entry.clientId, (current) => ({ ...current, progress: 90 }))
      await attachUpload(entry.clientId)

      setQueueOrder((current) => current.filter((clientId) => clientId !== entry.clientId))
      setActiveClientId(null)
    } catch (error) {
      const isAbortError = error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError'

      if (isAbortError) {
        updateUpload(entry.clientId, (current) => ({
          ...current,
          status: 'QUEUED',
          progress: 0,
          error: null,
          uploadedImageId: null,
          uploadedBucket: null,
          uploadedPath: null,
        }))
        return
      }

      if (uploadSessionImageId) {
        await deleteMediaUploadSession(uploadSessionImageId).catch(() => null)
      }

      updateUpload(entry.clientId, (current) => ({
        ...current,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Failed to upload image',
      }))

      setIsPaused(true)
    } finally {
      processingClientIdsRef.current.delete(entry.clientId)
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null
      }
      abortController.abort()
      setActiveClientId((current) => current === entry.clientId ? null : current)
    }
  }, [attachUpload, updateUpload])

  useEffect(() => {
    if (isPaused || activeClientId) return

    const nextClientId = queueOrder.find((clientId) => {
      if (processingClientIdsRef.current.has(clientId)) return false
      const upload = uploads[clientId]
      return Boolean(upload && upload.status !== 'FAILED')
    }) || null

    if (!nextClientId) return

    const nextEntry = queueEntriesRef.current.get(nextClientId)
    const nextUpload = uploads[nextClientId]
    if (!nextEntry || !nextUpload) {
      setQueueOrder((current) => current.filter((clientId) => clientId !== nextClientId))
      return
    }

    if (nextUpload.status === 'FAILED') {
      setIsPaused(true)
      return
    }

    processingClientIdsRef.current.add(nextClientId)
    setActiveClientId(nextClientId)
    void processActiveEntry(nextEntry)
  }, [activeClientId, isPaused, processActiveEntry, queueOrder, uploads])

  const queueUploads = useCallback((files: File[], target: MediaUploadTarget) => {
    const acceptedFiles = files.slice(0, MAX_UPLOADS_PER_TARGET)
    const createdAt = Date.now()

    const createdUploads = acceptedFiles.map((file, index) => ({
      clientId: createClientId(),
      target,
      fileName: file.name,
      status: 'QUEUED' as const,
      progress: 0,
      previewUrl: '',
      width: null,
      height: null,
      uploadedImageId: null,
      uploadedBucket: null,
      uploadedPath: null,
      gpsData: null,
      captureDate: null,
      error: null,
      attachedRecordId: null,
      startedAt: createdAt + index,
    }))

    setUploads((current) => {
      const next = { ...current }
      createdUploads.forEach((upload) => { next[upload.clientId] = upload })
      return next
    })
    setQueueOrder((current) => [...current, ...createdUploads.map((upload) => upload.clientId)])

    createdUploads.forEach((upload, index) => {
      const file = acceptedFiles[index]
      queueEntriesRef.current.set(upload.clientId, { clientId: upload.clientId, target, file })
      void buildPreviewUrl(file).then((previewUrl) => {
        updateUpload(upload.clientId, (current) => ({ ...current, previewUrl }))
      })
    })

  }, [updateUpload])

  const retryUpload = useCallback((clientId: string) => {
    const entry = queueEntriesRef.current.get(clientId)
    if (!entry) return

    setIsPaused(false)
    setQueueOrder((current) => [clientId, ...current.filter((queuedClientId) => queuedClientId !== clientId)])
    updateUpload(clientId, (current) => ({
      ...current,
      status: 'QUEUED',
      progress: 0,
      error: null,
      uploadedImageId: null,
      uploadedBucket: null,
      uploadedPath: null,
      attachedRecordId: null,
    }))
  }, [updateUpload])

  const removeUpload = useCallback(async (clientId: string) => {
    const upload = uploadsRef.current[clientId]
    if (!upload) return
    if (upload.uploadedImageId) {
      await deleteMediaUploadSession(upload.uploadedImageId).catch(() => null)
    }
    revokePreviewUrl(clientId)
    setUploads((current) => {
      const next = { ...current }
      delete next[clientId]
      return next
    })
    queueEntriesRef.current.delete(clientId)
    setQueueOrder((current) => current.filter((queuedClientId) => queuedClientId !== clientId))
    processingClientIdsRef.current.delete(clientId)
    setActiveClientId((current) => current === clientId ? null : current)
    setIsPaused(false)
  }, [revokePreviewUrl])

  const resumeQueue = useCallback(() => {
    setIsPaused(false)
  }, [])

  useEffect(() => {
    return () => {
      Object.values(uploadsRef.current).forEach((upload) => {
        if (upload.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(upload.previewUrl)
        }
      })
    }
  }, [])

  const value = useMemo<MediaUploadManagerValue>(() => ({
    uploads: uploadsList,
    activeClientId,
    isPaused,
    queueUploads,
    getUploadsForDraft,
    getUploadsForCrag,
    retryUpload,
    removeUpload,
    hasPendingUploads,
    hasFailedUploads,
    registerDraftUpdatedAt,
    resumeQueue,
    isQueuePaused,
    getActiveUpload,
  }), [activeClientId, getActiveUpload, getUploadsForCrag, getUploadsForDraft, hasFailedUploads, hasPendingUploads, isPaused, isQueuePaused, queueUploads, registerDraftUpdatedAt, removeUpload, resumeQueue, retryUpload, uploadsList])

  return <MediaUploadManagerContext.Provider value={value}>{children}</MediaUploadManagerContext.Provider>
}

export function useMediaUploadManager() {
  const context = useContext(MediaUploadManagerContext)
  if (!context) {
    throw new Error('useMediaUploadManager must be used within MediaUploadManagerProvider')
  }
  return context
}

export function useDraftUploadManager() {
  const context = useMediaUploadManager()
  return {
    uploads: context.uploads,
    activeClientId: context.activeClientId,
    isPaused: context.isPaused,
    queueDraftUploads: (files: File[], draftId: string) => context.queueUploads(files, { kind: 'draft', draftId }),
    getUploadsForDraft: context.getUploadsForDraft,
    retryUpload: context.retryUpload,
    removeUpload: context.removeUpload,
    hasPendingUploads: (draftId: string) => context.hasPendingUploads({ kind: 'draft', draftId }),
    hasFailedUploads: (draftId: string) => context.hasFailedUploads({ kind: 'draft', draftId }),
    registerDraftUpdatedAt: context.registerDraftUpdatedAt,
    resumeQueue: context.resumeQueue,
    isQueuePaused: (draftId?: string) => draftId ? context.isQueuePaused({ kind: 'draft', draftId }) : context.isQueuePaused(),
    getActiveUpload: (draftId: string) => context.getActiveUpload({ kind: 'draft', draftId }),
  }
}
