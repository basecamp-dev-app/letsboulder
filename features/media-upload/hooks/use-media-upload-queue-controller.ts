'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractGpsFromFile } from '@/lib/image-gps'
import { completeMediaUploadSession, createMediaUploadSession, deleteMediaUploadSession, getMediaUploadStatus, pollMediaUploadStatus, uploadFileToMediaSession } from '@/lib/media/client-upload'
import { uploadDebug, uploadDebugError } from '@/lib/media/upload-debug'
import { createAttachUpload } from '@/features/media-upload/lib/attach-upload'
import { enqueueUploads, prepareRetryQueue, removeUploadEntry, resetQueuedUpload } from '@/features/media-upload/lib/media-upload-controller-helpers'
import { buildPreviewUrl, getImageDimensions, preprocessFile } from '@/features/media-upload/lib/preprocess-image'
import { pickNextQueueClientId, resetUploadForQueue } from '@/features/media-upload/lib/media-upload-queue-state'
import { shouldResumeQueuedUploads } from '@/features/media-upload/lib/media-upload-resume-state'
import { createClientId, ensureFileName, mapMediaUploadStatus, MAX_UPLOADS_PER_TARGET, type MediaUploadItem, type MediaUploadTarget, type QueueEntry, type UploadCompleteCallback, type UploadCoordinates } from '@/features/media-upload/lib/upload-types'
import { persistNewUpload, persistUploadMetadata, removePersistedUpload, restoreUploads } from '@/features/media-upload/lib/durable-upload-store'
import { createClient } from '@/lib/supabase'
import { useOpenDataConsent } from '@/features/legal/public-client'

export interface MediaUploadQueueController {
  uploads: Record<string, MediaUploadItem>
  queueOrder: string[]
  activeClientId: string | null
  isPaused: boolean
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  queueUploads: (files: File[], target: MediaUploadTarget, fallbackCoordinates?: UploadCoordinates | null) => void
  updateUploadCoordinates: (clientId: string, coordinates: UploadCoordinates) => void
  retryUpload: (clientId: string) => void
  removeUpload: (clientId: string) => Promise<void>
  resumeQueue: () => void
  subscribeToUploadComplete: (callback: UploadCompleteCallback) => () => void
}

type UploadStateUpdater = (current: MediaUploadItem) => MediaUploadItem

function toActionableUploadError(error: unknown) {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : 'Failed to upload image'
  return `${message.replace(/[.!?]+$/, '')}. Retry or delete this upload.`
}

function waitForLifecyclePoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'))
      return
    }
    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException('Upload aborted', 'AbortError'))
    }
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, 1000)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export function useMediaUploadQueueController(): MediaUploadQueueController {
  const { requireConsent } = useOpenDataConsent()
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
  const userIdRef = useRef<string | null>(null)

  const uploadsRef = useRef(uploads)
  const queueOrderRef = useRef(queueOrder)
  const activeClientIdRef = useRef(activeClientId)
  const isPausedRef = useRef(isPaused)

  useEffect(() => { uploadsRef.current = uploads }, [uploads])
  useEffect(() => { queueOrderRef.current = queueOrder }, [queueOrder])
  useEffect(() => { activeClientIdRef.current = activeClientId }, [activeClientId])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])

  const updateUpload = useCallback((clientId: string, updater: UploadStateUpdater) => {
    const current = uploadsRef.current
    const existing = current[clientId]
    if (!existing) return
    const nextUploads = { ...current, [clientId]: updater(existing) }
    uploadsRef.current = nextUploads
    setUploads(nextUploads)
    if (userIdRef.current) void persistUploadMetadata(userIdRef.current, nextUploads[clientId])
  }, [])

  const setQueuePaused = useCallback((paused: boolean) => {
    isPausedRef.current = paused
    setIsPaused(paused)
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
    let transferCompleted = false

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

      const purpose = entry.target.kind === 'draft' ? 'draft_image' : 'crag_image'
      let completion = upload.uploadedImageId
        ? await getMediaUploadStatus(upload.uploadedImageId, abortController.signal).catch(() => null)
        : null
      if (!entry.isPrepared && upload.uploadedImageId && !completion) {
        throw new Error('The previous upload session could not be recovered')
      }
      if (!completion?.uploadCommitted) {
        let preparedFile = entry.file
        let gpsData = upload.gpsData
        if (!entry.isPrepared) {
          const extractedGpsData = await extractGpsFromFile(entry.file)
          gpsData = extractedGpsData || upload.gpsData
          preparedFile = await preprocessFile(entry.file)
          const userId = userIdRef.current
          if (!userId) throw new Error('Prepared photo could not be saved on this device')
          const preparedUpload = upload.uploadedImageId
            ? { ...upload, uploadedImageId: null, uploadedBucket: null, uploadedPath: null, gpsData }
            : { ...upload, gpsData }
          if (upload.uploadedImageId) {
            await deleteMediaUploadSession(upload.uploadedImageId)
            await persistUploadMetadata(userId, preparedUpload)
            updateUpload(entry.clientId, () => preparedUpload)
          }
          if (!await persistNewUpload(userId, preparedUpload, preparedFile)) {
            throw new Error('Prepared photo could not be saved on this device')
          }
          entry.file = preparedFile
          entry.isPrepared = true
        }
        updateUpload(entry.clientId, (current) => ({ ...current, status: 'PREPROCESSING', progress: 10, error: null }))
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
          clientUploadId: entry.clientId,
          purpose,
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
        updateUpload(entry.clientId, (current) => ({
          ...current,
          progress: 55,
          uploadedImageId: uploadSession.imageId,
          uploadedBucket: uploadSession.bucket,
          uploadedPath: uploadSession.objectKey,
        }))
        if (uploadSession.uploadCommitted) {
          completion = await getMediaUploadStatus(uploadSession.imageId, abortController.signal)
        } else {
          await uploadFileToMediaSession(uploadSession.uploadUrl, uploadSession.uploadHeaders, preparedFile, {
            signal: abortController.signal,
            onProgress: ({ progress }) => updateUpload(entry.clientId, (current) => ({
              ...current,
              progress: Math.max(current.progress, 35 + Math.round(progress * 0.45)),
            })),
          })
          updateUpload(entry.clientId, (current) => ({ ...current, progress: 80 }))
          completion = await completeMediaUploadSession(uploadSession.imageId, purpose, abortController.signal)
        }
      } else {
        uploadSessionImageId = upload.uploadedImageId
      }
      if (!completion || !uploadSessionImageId) throw new Error('Upload session could not be recovered')
      uploadDebug('upload-session-complete-succeeded', {
        clientId: entry.clientId,
        imageId: uploadSessionImageId,
      })
      updateUpload(entry.clientId, (current) => ({
        ...current,
        status: mapMediaUploadStatus(completion),
        progress: 90,
      }))
      if (entry.target.kind === 'draft') {
        await attachUpload(entry.clientId)
        if (userIdRef.current) await removePersistedUpload(userIdRef.current, entry.clientId)
        uploadDebug('attach-upload-succeeded', {
          clientId: entry.clientId,
          imageId: uploadSessionImageId,
        })
      }

      // Release serialization after completion/draft attachment; lifecycle polling must not block the next upload.
      const nextQueueOrder = queueOrderRef.current.filter((clientId) => clientId !== entry.clientId)
      queueOrderRef.current = nextQueueOrder
      setQueueOrder(nextQueueOrder)
      if (activeClientIdRef.current === entry.clientId) {
        activeClientIdRef.current = null
      }
      setActiveClientId(null)
      transferCompleted = true
      startNextUploadRef.current()

      let finalStatus = completion
      while (mapMediaUploadStatus(finalStatus) !== 'READY' && mapMediaUploadStatus(finalStatus) !== 'FAILED') {
        if (mapMediaUploadStatus(finalStatus) === 'MODERATING') {
          await waitForLifecyclePoll(abortController.signal)
        }
        finalStatus = await pollMediaUploadStatus(uploadSessionImageId, abortController.signal, (statusResponse) => {
          updateUpload(entry.clientId, (current) => ({
            ...current,
            status: mapMediaUploadStatus(statusResponse),
          }))
        })
      }
      const finalUploadStatus = mapMediaUploadStatus(finalStatus)
      if (finalUploadStatus === 'READY' && entry.target.kind === 'crag') {
        await attachUpload(entry.clientId)
        if (userIdRef.current) await removePersistedUpload(userIdRef.current, entry.clientId)
        uploadDebug('attach-upload-succeeded', {
          clientId: entry.clientId,
          imageId: uploadSessionImageId,
        })
      }
      updateUpload(entry.clientId, (current) => ({
        ...current,
        status: finalUploadStatus,
        progress: finalUploadStatus === 'READY' ? 100 : current.progress,
        error: finalUploadStatus === 'FAILED' ? finalStatus.errorCode || 'Photo processing failed' : null,
      }))
      const previewClientId = entry.clientId
      setTimeout(() => revokePreviewUrl(previewClientId), 10000)
    } catch (error) {
      const isAbortError = error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError'
      uploadDebugError('process-active-entry-error', error, {
        clientId: entry.clientId,
        imageId: uploadSessionImageId,
        isAbortError,
        fileName: entry.file.name,
        fileSize: entry.file.size,
        fileType: entry.file.type,
        online: window.navigator.onLine,
      })

      if (isAbortError) {
        if (!transferCompleted) updateUpload(entry.clientId, resetUploadForQueue)
        return
      }

      if (transferCompleted) {
        updateUpload(entry.clientId, (current) => ({
          ...current,
          status: 'FAILED',
          error: toActionableUploadError(error),
        }))
        return
      }

      if (window.navigator.onLine === false) setQueuePaused(true)

      updateUpload(entry.clientId, (current) => ({
        ...current,
        status: 'FAILED',
        error: toActionableUploadError(error),
      }))
      const nextQueueOrder = queueOrderRef.current.filter((clientId) => clientId !== entry.clientId)
      queueOrderRef.current = nextQueueOrder
      setQueueOrder(nextQueueOrder)

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
        setActiveClientId(null)
      }
      startNextUploadRef.current()
    }
  }, [attachUpload, revokePreviewUrl, setQueuePaused, updateUpload])

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
      uploadDebug('start-next-upload-skipped-failed-item', { nextClientId })
      const nextQueueOrder = queueOrderRef.current.filter((clientId) => clientId !== nextClientId)
      queueOrderRef.current = nextQueueOrder
      setQueueOrder(nextQueueOrder)
      startNextUploadRef.current()
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

  const queueUploadsAfterConsent = useCallback((files: File[], target: MediaUploadTarget, fallbackCoordinates?: UploadCoordinates | null) => {
    const existingCount = Object.values(uploadsRef.current).filter((upload) => {
      if (upload.target.kind !== target.kind) return false
      return target.kind === 'draft'
        ? upload.target.kind === 'draft' && upload.target.draftId === target.draftId
        : upload.target.kind === 'crag' && upload.target.cragId === target.cragId
    }).length
    const acceptedFiles = files.slice(0, Math.max(0, MAX_UPLOADS_PER_TARGET - existingCount))
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
      missingExif: false,
      captureDate: null,
      error: null,
      attachedRecordId: null,
      startedAt: createdAt + index,
    }))

    void (async () => {
      const userId = userIdRef.current || (await createClient().auth.getUser()).data.user?.id || null
      if (!userId) {
        const failedUploads = createdUploads.map((upload) => ({ ...upload, status: 'FAILED' as const, error: 'Sign in again before saving these photos on this device.' }))
        const nextUploads = { ...uploadsRef.current, ...Object.fromEntries(failedUploads.map((upload) => [upload.clientId, upload])) }
        uploadsRef.current = nextUploads
        setUploads(nextUploads)
        return
      }
      userIdRef.current = userId
      const durableRecords: Array<{ upload: MediaUploadItem; file: File }> = []
      const failedUploads: MediaUploadItem[] = []
      for (let index = 0; index < createdUploads.length; index += 1) {
        const upload = createdUploads[index]
        const file = acceptedFiles[index]
        try {
          const gpsData = await extractGpsFromFile(file)
          const preparedFile = await preprocessFile(file)
          const preparedUpload = { ...upload, gpsData: gpsData || fallbackCoordinates || null, missingExif: !gpsData }
          if (await persistNewUpload(userId, preparedUpload, preparedFile)) {
            durableRecords.push({ upload: preparedUpload, file: preparedFile })
            queueEntriesRef.current.set(upload.clientId, { clientId: upload.clientId, target, file: preparedFile, isPrepared: true })
            continue
          }
        } catch (error) {
          uploadDebugError('queue-preparation-failed', error, {
            clientId: upload.clientId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          })
        }
        failedUploads.push({ ...upload, status: 'FAILED', error: 'This photo could not be prepared and saved on this device. Free storage space, then select it again.' })
      }
      const { nextUploads: queuedUploads, nextQueueOrder } = enqueueUploads(uploadsRef.current, queueOrderRef.current, durableRecords.map((record) => record.upload))
      const nextUploads = { ...queuedUploads, ...Object.fromEntries(failedUploads.map((upload) => [upload.clientId, upload])) }
      uploadsRef.current = nextUploads
      queueOrderRef.current = nextQueueOrder
      setUploads(nextUploads)
      setQueueOrder(nextQueueOrder)
      durableRecords.forEach(({ upload, file }) => {
        void buildPreviewUrl(file).then((previewUrl) => updateUpload(upload.clientId, (current) => ({ ...current, previewUrl })))
      })
      queueMicrotask(() => startNextUploadRef.current())
    })()
  }, [updateUpload])

  const queueUploads = useCallback((files: File[], target: MediaUploadTarget, fallbackCoordinates?: UploadCoordinates | null) => {
    void requireConsent(() => queueUploadsAfterConsent(files, target, fallbackCoordinates))
  }, [queueUploadsAfterConsent, requireConsent])

  const updateUploadCoordinates = useCallback((clientId: string, coordinates: UploadCoordinates) => {
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return
    if (coordinates.latitude < -90 || coordinates.latitude > 90 || coordinates.longitude < -180 || coordinates.longitude > 180) return
    updateUpload(clientId, (current) => ({ ...current, gpsData: coordinates }))
  }, [updateUpload])

  const retryUpload = useCallback((clientId: string) => {
    const entry = queueEntriesRef.current.get(clientId)
    if (!entry) return

    alreadyAttachedRef.current.delete(clientId)
    setQueuePaused(false)
    const nextQueueOrder = prepareRetryQueue(queueOrderRef.current, clientId)
    queueOrderRef.current = nextQueueOrder
    setQueueOrder(nextQueueOrder)
    updateUpload(clientId, resetQueuedUpload)
    uploadDebug('queue-retry-requested', { clientId })
    queueMicrotask(() => {
      startNextUploadRef.current()
    })
  }, [setQueuePaused, updateUpload])

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
    setQueuePaused(false)
    if (userIdRef.current) await removePersistedUpload(userIdRef.current, clientId)
    startNextUploadRef.current()
  }, [revokePreviewUrl, setQueuePaused])

  const resumeQueue = useCallback(() => {
    setQueuePaused(false)
    uploadDebug('queue-resume-requested', {
      queueOrder: queueOrderRef.current,
    })
    queueMicrotask(() => {
      startNextUploadRef.current()
    })
  }, [setQueuePaused])

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await createClient().auth.getUser()
      const userId = data.user?.id
      if (!userId || cancelled) return
      userIdRef.current = userId
      const restored = await restoreUploads(userId)
      if (cancelled || restored.length === 0) return
      const restoredUploads = restored.map((record) => record.item)
      restored.forEach((record) => queueEntriesRef.current.set(record.item.clientId, record.entry))
      const next = enqueueUploads(uploadsRef.current, queueOrderRef.current, restoredUploads)
      uploadsRef.current = next.nextUploads
      queueOrderRef.current = next.nextQueueOrder
      setUploads(next.nextUploads)
      setQueueOrder(next.nextQueueOrder)
      queueMicrotask(() => startNextUploadRef.current())
    })()
    return () => { cancelled = true }
  }, [])

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
    updateUploadCoordinates,
    retryUpload,
    removeUpload,
    resumeQueue,
    subscribeToUploadComplete,
  }
}
