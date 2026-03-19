'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import imageCompression from 'browser-image-compression'
import { csrfFetch } from '@/hooks/useCsrf'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { extractGpsFromFile } from '@/lib/image-gps'
import { stripExifMetadataFromFile } from '@/lib/image-metadata'
import { isHeicFile } from '@/lib/image-utils'
import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, uploadFileToMediaSession } from '@/lib/media/client-upload'

const MAX_DRAFT_UPLOADS = 20
const SKIP_COMPRESSION_THRESHOLD_BYTES = 1024 * 1024
const THUMBNAIL_MAX_WIDTH = 320

export type DraftUploadStatus = 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'

export interface DraftUploadItem {
  clientId: string
  draftId: string
  fileName: string
  status: DraftUploadStatus
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
  attachedDraftImageId: string | null
  startedAt: number
}

interface QueueEntry {
  clientId: string
  draftId: string
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

interface DraftUploadManagerValue {
  uploads: DraftUploadItem[]
  activeClientId: string | null
  isPaused: boolean
  queueDraftUploads: (files: File[], draftId: string) => void
  getUploadsForDraft: (draftId: string) => DraftUploadItem[]
  retryUpload: (clientId: string) => void
  removeUpload: (clientId: string) => Promise<void>
  hasPendingUploads: (draftId: string) => boolean
  hasFailedUploads: (draftId: string) => boolean
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  resumeQueue: () => void
  isQueuePaused: (draftId?: string) => boolean
  getActiveUpload: (draftId: string) => DraftUploadItem | null
}

const DraftUploadManagerContext = createContext<DraftUploadManagerValue | null>(null)

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `draft-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ensureFileName(file: Blob, fallbackName: string) {
  return file instanceof File ? file.name : fallbackName
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

export function DraftUploadManagerProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Record<string, DraftUploadItem>>({})
  const [queueOrder, setQueueOrder] = useState<string[]>([])
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const queueEntriesRef = useRef<Map<string, QueueEntry>>(new Map())
  const draftUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const drainScheduledRef = useRef(false)
  const activeAbortControllerRef = useRef<AbortController | null>(null)

  const uploadsRef = useRef(uploads)
  const queueOrderRef = useRef(queueOrder)
  const activeClientIdRef = useRef(activeClientId)
  const isPausedRef = useRef(isPaused)

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  useEffect(() => {
    queueOrderRef.current = queueOrder
  }, [queueOrder])

  useEffect(() => {
    activeClientIdRef.current = activeClientId
  }, [activeClientId])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  const uploadsList = useMemo(() => Object.values(uploads).sort((a, b) => a.startedAt - b.startedAt), [uploads])

  const updateUpload = useCallback((clientId: string, updater: (current: DraftUploadItem) => DraftUploadItem) => {
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
      return {
        ...current,
        [clientId]: {
          ...existing,
          previewUrl: '',
        },
      }
    })
  }, [])

  const registerDraftUpdatedAt = useCallback((draftId: string, updatedAt: string) => {
    draftUpdatedAtRef.current.set(draftId, updatedAt)
  }, [])

  const getUploadsForDraft = useCallback((draftId: string) => {
    return uploadsList.filter((upload) => upload.draftId === draftId)
  }, [uploadsList])

  const getActiveUpload = useCallback((draftId: string) => {
    if (!activeClientId) return null
    const upload = uploads[activeClientId] || null
    if (!upload || upload.draftId !== draftId) return null
    return upload
  }, [activeClientId, uploads])

  const isQueuePaused = useCallback((draftId?: string) => {
    if (!isPaused) return false
    if (!draftId) return true
    const activeUpload = activeClientId ? uploads[activeClientId] : null
    if (activeUpload?.draftId === draftId) return true
    return queueOrder.some((clientId) => uploads[clientId]?.draftId === draftId)
  }, [activeClientId, isPaused, queueOrder, uploads])

  const hasPendingUploads = useCallback((draftId: string) => {
    return getUploadsForDraft(draftId).some((upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING')
  }, [getUploadsForDraft])

  const hasFailedUploads = useCallback((draftId: string) => {
    return getUploadsForDraft(draftId).some((upload) => upload.status === 'FAILED')
  }, [getUploadsForDraft])

  const attachUploadToDraft = useCallback(async (clientId: string) => {
    let attempts = 0

    while (attempts < 2) {
      attempts += 1
      const upload = uploadsRef.current[clientId]
      if (!upload) return

      const expectedUpdatedAt = draftUpdatedAtRef.current.get(upload.draftId)
      if (!expectedUpdatedAt || !upload.uploadedBucket || !upload.uploadedPath) {
        throw new Error('Draft is not ready to receive uploads yet')
      }

      const response = await csrfFetch(`/api/submissions/drafts/${upload.draftId}/images`, {
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
          draftUpdatedAtRef.current.set(upload.draftId, payload.draft.updated_at)
        }
        const attachedDraftImageId = Array.isArray(payload.draft?.appended_image_ids)
          ? payload.draft?.appended_image_ids[0] || null
          : null
        updateUpload(clientId, (current) => ({
          ...current,
          status: 'SUCCESS',
          progress: 100,
          error: null,
          attachedDraftImageId,
        }))
        revokePreviewUrl(clientId)
        return
      }

      if (response.status === 409 && payload.code === 'draft_conflict' && payload.current_updated_at) {
        draftUpdatedAtRef.current.set(upload.draftId, payload.current_updated_at)
        continue
      }

      throw new Error(payload.error || 'Failed to attach upload to draft')
    }

    throw new Error('Draft changed while attaching upload. Please retry.')
  }, [revokePreviewUrl, updateUpload])

  const drainQueueRef = useRef<() => void>(() => {})

  const processActiveEntry = useCallback(async (entry: QueueEntry) => {
    const abortController = new AbortController()
    activeAbortControllerRef.current = abortController
    let uploadSessionImageId: string | null = null
    let completedSuccessfully = false

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
        purpose: 'draft_image',
        contentType: preparedFile.type || 'image/jpeg',
        fileName: ensureFileName(preparedFile, entry.file.name),
        byteSize: preparedFile.size,
        draftId: entry.draftId,
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

      await completeMediaUploadSession(uploadSession.imageId, abortController.signal)
      updateUpload(entry.clientId, (current) => ({ ...current, progress: 90 }))
      await attachUploadToDraft(entry.clientId)

      completedSuccessfully = true
      setQueueOrder((current) => current.filter((clientId) => clientId !== entry.clientId))
    } catch (error) {
      const isAbortError = error instanceof DOMException
        ? error.name === 'AbortError'
        : error instanceof Error && error.name === 'AbortError'

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
      revokePreviewUrl(entry.clientId)
    } finally {
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null
      }
      abortController.abort()
      if (!completedSuccessfully) {
        setActiveClientId(null)
      }
      drainQueueRef.current()
    }
  }, [attachUploadToDraft, revokePreviewUrl, updateUpload])

  const drainQueue = useCallback(() => {
    if (drainScheduledRef.current) return
    drainScheduledRef.current = true

    queueMicrotask(() => {
      drainScheduledRef.current = false
      if (activeClientIdRef.current || isPausedRef.current) return

      const nextClientId = queueOrderRef.current[0] || null
      if (!nextClientId) return

      const nextEntry = queueEntriesRef.current.get(nextClientId)
      const nextUpload = uploadsRef.current[nextClientId]
      if (!nextEntry || !nextUpload) {
        setQueueOrder((current) => current.filter((clientId) => clientId !== nextClientId))
        drainQueue()
        return
      }

      if (nextUpload.status === 'FAILED') {
        setIsPaused(true)
        return
      }

      setActiveClientId(nextClientId)
      void processActiveEntry(nextEntry)
    })
  }, [processActiveEntry])

  drainQueueRef.current = drainQueue

  const queueDraftUploads = useCallback((files: File[], draftId: string) => {
    const acceptedFiles = files.slice(0, MAX_DRAFT_UPLOADS)
    const createdAt = Date.now()

    const createdUploads = acceptedFiles.map((file, index) => ({
      clientId: createClientId(),
      draftId,
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
      attachedDraftImageId: null,
      startedAt: createdAt + index,
    }))

    setUploads((current) => {
      const next = { ...current }
      createdUploads.forEach((upload) => {
        next[upload.clientId] = upload
      })
      return next
    })

    setQueueOrder((current) => [...current, ...createdUploads.map((upload) => upload.clientId)])

    createdUploads.forEach((upload, index) => {
      const file = acceptedFiles[index]
      queueEntriesRef.current.set(upload.clientId, { clientId: upload.clientId, draftId, file })
      void buildPreviewUrl(file).then((previewUrl) => {
        updateUpload(upload.clientId, (current) => ({ ...current, previewUrl }))
      })
    })

    drainQueue()
  }, [drainQueue, updateUpload])

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
      attachedDraftImageId: null,
    }))

    drainQueue()
  }, [drainQueue, updateUpload])

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

    if (activeClientIdRef.current === clientId) {
      setActiveClientId(null)
    }
    setIsPaused(false)
    drainQueue()
  }, [drainQueue, revokePreviewUrl])

  const resumeQueue = useCallback(() => {
    setIsPaused(false)
    drainQueue()
  }, [drainQueue])

  useEffect(() => {
    return () => {
      Object.values(uploadsRef.current).forEach((upload) => {
        if (upload.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(upload.previewUrl)
        }
      })
    }
  }, [])

  const value = useMemo<DraftUploadManagerValue>(() => ({
    uploads: uploadsList,
    activeClientId,
    isPaused,
    queueDraftUploads,
    getUploadsForDraft,
    retryUpload,
    removeUpload,
    hasPendingUploads,
    hasFailedUploads,
    registerDraftUpdatedAt,
    resumeQueue,
    isQueuePaused,
    getActiveUpload,
  }), [activeClientId, getActiveUpload, getUploadsForDraft, hasFailedUploads, hasPendingUploads, isPaused, isQueuePaused, queueDraftUploads, registerDraftUpdatedAt, removeUpload, resumeQueue, retryUpload, uploadsList])

  return (
    <DraftUploadManagerContext.Provider value={value}>
      {children}
    </DraftUploadManagerContext.Provider>
  )
}

export function useDraftUploadManager() {
  const context = useContext(DraftUploadManagerContext)
  if (!context) {
    throw new Error('useDraftUploadManager must be used within DraftUploadManagerProvider')
  }

  return context
}
