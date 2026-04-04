'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractGpsFromFile } from '@/lib/image-gps'
import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, uploadFileToMediaSession } from '@/lib/media/client-upload'
import { uploadDebug } from '@/lib/media/upload-debug'
import { createAttachUpload } from '@/features/submissions/upload/lib/attach-upload'
import { enqueueUploads, prepareRetryQueue, removeUploadEntry, resetQueuedUpload } from '@/features/submissions/upload/lib/media-upload-controller-helpers'
import { buildPreviewUrl, getImageDimensions, preprocessFile } from '@/features/submissions/upload/lib/preprocess-image'
import { pickNextQueueClientId, resetUploadForQueue } from '@/features/submissions/upload/lib/media-upload-queue-state'
import { shouldResumeQueuedUploads } from '@/features/submissions/upload/lib/media-upload-resume-state'
import { createClientId, ensureFileName, MAX_UPLOADS_PER_TARGET, type MediaUploadItem, type MediaUploadTarget, type QueueEntry, type UploadCompleteCallback } from '@/features/submissions/upload/lib/upload-types'

export interface MediaUploadQueueController {
  uploads: Record<string, MediaUploadItem>
  queueOrder: string[]
  activeClientId: string | null
  isPaused: boolean
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  queueUploads: (files: File[], target: MediaUploadTarget) => void
  retryUpload: (clientId: string) => void
  removeUpload: (clientId: string) => Promise<void>
  resumeQueue: () => void
  subscribeToUploadComplete: (callback: UploadCompleteCallback) => () => void
}

type UploadStateUpdater = (current: MediaUploadItem) => MediaUploadItem

export function useMediaUploadQueueController(): MediaUploadQueueController {
  const [uploads, setUploads] = useState<Record<string, MediaUploadItem>>({})
  const [queueOrder, setQueueOrder] = useState<string[]>([])
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const queueEntriesRef = useRef<Map<string, QueueEntry>>(new Map())
  const draftUpdatedAtRef = useRef<Map<string, string>>(new Map())
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const processingClientIdsRef = useRef<Set<string>>(new Set())
  const alreadyAttachedRef = useRef<Set<string>>(new Set())
  const subscribersRef = useRef<Set<UploadCompleteCallback>>(new Set())

  const uploadsRef = useRef(uploads)
  const queueOrderRef = useRef(queueOrder)
  const activeClientIdRef = useRef(activeClientId)
  const isPausedRef = useRef(isPaused)

  useEffect(() => { uploadsRef.current = uploads }, [uploads])
  useEffect(() => { queueOrderRef.current = queueOrder }, [queueOrder])
  useEffect(() => { activeClientIdRef.current = activeClientId }, [activeClientId])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])

  const updateUpload = useCallback((clientId: string, updater: UploadStateUpdater) => {
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

  const attachUpload = useMemo(() => createAttachUpload({
    uploadsRef,
    alreadyAttachedRef,
    draftUpdatedAtRef,
    subscribersRef,
    updateUpload,
  }), [updateUpload])

  const startNextUploadRef = useRef<() => void>(() => {})

  const processActiveEntry = useCallback(async (entry: QueueEntry) => {
    const abortController = new AbortController()
    activeAbortControllerRef.current = abortController
    let uploadSessionImageId: string | null = null

    uploadDebug('process-active-entry-start', {
      clientId: entry.clientId,
      target: entry.target.kind,
      targetId: entry.target.kind === 'draft' ? entry.target.draftId : entry.target.cragId,
      fileName: entry.file.name,
      queueLength: queueOrderRef.current.length,
    })

    try {
      const upload = uploadsRef.current[entry.clientId]
      if (!upload) {
        throw new Error('Upload entry is missing')
      }

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
        fileName: ensureFileName(preparedFile, entry.file.name).trim() || 'upload.jpg',
        byteSize: preparedFile.size,
        gpsData,
        captureDate: upload.captureDate,
        width: dimensions.width,
        height: dimensions.height,
        draftId: entry.target.kind === 'draft' ? entry.target.draftId : undefined,
        cragId: entry.target.kind === 'crag' ? entry.target.cragId : undefined,
      }, abortController.signal)
      uploadSessionImageId = uploadSession.imageId

      uploadDebug('upload-session-created', {
        clientId: entry.clientId,
        imageId: uploadSession.imageId,
        objectKey: uploadSession.objectKey,
      })

      updateUpload(entry.clientId, (current) => ({
        ...current,
        progress: 55,
        uploadedImageId: uploadSession.imageId,
        uploadedBucket: uploadSession.bucket,
        uploadedPath: uploadSession.objectKey,
      }))

      await uploadFileToMediaSession(uploadSession.uploadUrl, uploadSession.uploadHeaders, preparedFile, {
        signal: abortController.signal,
        onProgress: ({ progress }) => {
          updateUpload(entry.clientId, (current) => ({
            ...current,
            progress: Math.max(current.progress, 35 + Math.round(progress * 0.45)),
          }))
        },
      })
      updateUpload(entry.clientId, (current) => ({ ...current, progress: 80 }))

      await completeMediaUploadSession(uploadSession.imageId, entry.target.kind === 'draft' ? 'draft_image' : 'crag_image', abortController.signal)
      uploadDebug('upload-session-complete-succeeded', {
        clientId: entry.clientId,
        imageId: uploadSession.imageId,
      })
      updateUpload(entry.clientId, (current) => ({ ...current, progress: 90 }))
      await attachUpload(entry.clientId)
      uploadDebug('attach-upload-succeeded', {
        clientId: entry.clientId,
        imageId: uploadSession.imageId,
      })

      const previewClientId = entry.clientId
      setTimeout(() => revokePreviewUrl(previewClientId), 10000)

      const nextQueueOrder = queueOrderRef.current.filter((clientId) => clientId !== entry.clientId)
      queueOrderRef.current = nextQueueOrder
      setQueueOrder(nextQueueOrder)
      if (activeClientIdRef.current === entry.clientId) {
        activeClientIdRef.current = null
      }
      setActiveClientId(null)
    } catch (error) {
      const isAbortError = error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError'
      uploadDebug('process-active-entry-error', {
        clientId: entry.clientId,
        imageId: uploadSessionImageId,
        isAbortError,
        message: error instanceof Error ? error.message : 'Unknown upload error',
      })

      if (isAbortError) {
        updateUpload(entry.clientId, resetUploadForQueue)
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

      uploadDebug('upload-marked-failed', { clientId: entry.clientId })
    } finally {
      uploadDebug('process-active-entry-finally', {
        clientId: entry.clientId,
        activeClientId: activeClientIdRef.current,
        queueOrder: queueOrderRef.current,
        isPaused: isPausedRef.current,
        processingClientIds: Array.from(processingClientIdsRef.current),
      })
      processingClientIdsRef.current.delete(entry.clientId)
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null
      }
      abortController.abort()
      if (activeClientIdRef.current === entry.clientId) {
        activeClientIdRef.current = null
      }
      setActiveClientId(null)
      startNextUploadRef.current()
    }
  }, [attachUpload, revokePreviewUrl, updateUpload])

  const startNextUpload = useCallback(() => {
    uploadDebug('start-next-upload-called', {
      activeClientId: activeClientIdRef.current,
      isPaused: isPausedRef.current,
      queueOrder: queueOrderRef.current,
      processingClientIds: Array.from(processingClientIdsRef.current),
    })

    const nextClientId = pickNextQueueClientId({
      activeClientId: activeClientIdRef.current,
      isPaused: isPausedRef.current,
      processingClientIds: processingClientIdsRef.current,
      queueOrder: queueOrderRef.current,
      uploads: uploadsRef.current,
    })

    if (!nextClientId) {
      uploadDebug('queue-drained', {
        queueOrder: queueOrderRef.current,
        activeClientId: activeClientIdRef.current,
      })
      return
    }

    const nextEntry = queueEntriesRef.current.get(nextClientId)
    const nextUpload = uploadsRef.current[nextClientId]
    if (!nextEntry || !nextUpload) {
      uploadDebug('start-next-upload-missing-entry', {
        nextClientId,
        hasEntry: Boolean(nextEntry),
        hasUpload: Boolean(nextUpload),
      })
      const nextQueueOrder = queueOrderRef.current.filter((clientId) => clientId !== nextClientId)
      queueOrderRef.current = nextQueueOrder
      setQueueOrder(nextQueueOrder)
      startNextUploadRef.current()
      return
    }

    if (nextUpload.status === 'FAILED') {
      uploadDebug('start-next-upload-paused-on-failed-item', { nextClientId })
      setIsPaused(true)
      return
    }

    processingClientIdsRef.current.add(nextClientId)
    activeClientIdRef.current = nextClientId
    uploadDebug('start-next-upload-starting', {
      nextClientId,
      status: nextUpload.status,
      fileName: nextUpload.fileName,
    })
    setActiveClientId(nextClientId)
    void processActiveEntry(nextEntry)
  }, [processActiveEntry])

  startNextUploadRef.current = startNextUpload

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
      createdUploads.forEach((upload) => {
        next[upload.clientId] = upload
      })
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

    uploadDebug('queue-created', {
      target: target.kind,
      targetId: target.kind === 'draft' ? target.draftId : target.cragId,
      clientIds: createdUploads.map((upload) => upload.clientId),
      fileNames: createdUploads.map((upload) => upload.fileName),
      queueLengthAfterEnqueue: queueOrderRef.current.length + createdUploads.length,
    })

      const { nextUploads, nextQueueOrder } = enqueueUploads(uploadsRef.current, queueOrderRef.current, createdUploads)
      uploadsRef.current = nextUploads
      queueOrderRef.current = nextQueueOrder

    queueMicrotask(() => {
      startNextUploadRef.current()
    })
  }, [updateUpload])

  const retryUpload = useCallback((clientId: string) => {
    const entry = queueEntriesRef.current.get(clientId)
    if (!entry) return

    alreadyAttachedRef.current.delete(clientId)
    setIsPaused(false)
    const nextQueueOrder = prepareRetryQueue(queueOrderRef.current, clientId)
    queueOrderRef.current = nextQueueOrder
    setQueueOrder(nextQueueOrder)
    updateUpload(clientId, resetQueuedUpload)
    uploadDebug('queue-retry-requested', { clientId })
    queueMicrotask(() => {
      startNextUploadRef.current()
    })
  }, [updateUpload])

  const removeUpload = useCallback(async (clientId: string) => {
    const { nextUploads, nextQueueOrder } = await removeUploadEntry({
      clientId,
      uploads: uploadsRef.current,
      queueOrder: queueOrderRef.current,
      queueEntries: queueEntriesRef.current,
      alreadyAttached: alreadyAttachedRef.current,
      processingClientIds: processingClientIdsRef.current,
      revokePreviewUrl,
    })
    uploadsRef.current = nextUploads
    setUploads(nextUploads)
    queueOrderRef.current = nextQueueOrder
    setQueueOrder(nextQueueOrder)
    if (activeClientIdRef.current === clientId) {
      activeClientIdRef.current = null
    }
    setActiveClientId((current) => current === clientId ? null : current)
    setIsPaused(false)
    startNextUploadRef.current()
  }, [revokePreviewUrl])

  const resumeQueue = useCallback(() => {
    setIsPaused(false)
    uploadDebug('queue-resume-requested', {
      queueOrder: queueOrderRef.current,
    })
    queueMicrotask(() => {
      startNextUploadRef.current()
    })
  }, [])

  useEffect(() => {
    const resumeIfNeeded = () => {
      if (!shouldResumeQueuedUploads({
        visibilityState: document.visibilityState,
        isPaused: isPausedRef.current,
        activeClientId: activeClientIdRef.current,
        queueLength: queueOrderRef.current.length,
      })) return
      queueMicrotask(() => {
        startNextUploadRef.current()
      })
    }

    const handlePageShow = () => {
      resumeIfNeeded()
    }

    document.addEventListener('visibilitychange', resumeIfNeeded)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', resumeIfNeeded)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!shouldResumeQueuedUploads({
        visibilityState: document.visibilityState,
        isPaused: isPausedRef.current,
        activeClientId: activeClientIdRef.current,
        queueLength: queueOrderRef.current.length,
      })) return
      queueMicrotask(() => {
        startNextUploadRef.current()
      })
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      if (isPausedRef.current) {
        uploadDebug('network-reconnected-resuming')
        resumeQueue()
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [resumeQueue])

  const subscribeToUploadComplete = useCallback((callback: UploadCompleteCallback) => {
    subscribersRef.current.add(callback)
    return () => {
      subscribersRef.current.delete(callback)
    }
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

  return {
    uploads,
    queueOrder,
    activeClientId,
    isPaused,
    registerDraftUpdatedAt,
    queueUploads,
    retryUpload,
    removeUpload,
    resumeQueue,
    subscribeToUploadComplete,
  }
}
