'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useMediaUploadQueueController } from '@/features/media-upload/hooks/use-media-upload-queue-controller'
import { isSameTarget, type MediaUploadItem, type MediaUploadTarget, type UploadCompleteCallback } from '@/features/media-upload/lib/upload-types'

export type { MediaUploadItem, MediaUploadTarget, UploadCompleteCallback } from '@/features/media-upload/lib/upload-types'

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
  subscribeToUploadComplete: (callback: UploadCompleteCallback) => () => void
}

const MediaUploadManagerContext = createContext<MediaUploadManagerValue | null>(null)


export function MediaUploadManagerProvider({ children }: { children: ReactNode }) {
  const {
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
  } = useMediaUploadQueueController()

  const uploadsList = useMemo(() => Object.values(uploads).sort((a, b) => a.startedAt - b.startedAt), [uploads])

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
    subscribeToUploadComplete,
  }), [activeClientId, getActiveUpload, getUploadsForCrag, getUploadsForDraft, hasFailedUploads, hasPendingUploads, isPaused, isQueuePaused, queueUploads, registerDraftUpdatedAt, removeUpload, resumeQueue, retryUpload, subscribeToUploadComplete, uploadsList])

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
    subscribeToUploadComplete: context.subscribeToUploadComplete,
  }
}
