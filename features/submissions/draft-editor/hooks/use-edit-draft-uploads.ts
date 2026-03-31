'use client'

import { useCallback, useEffect, useMemo, type MutableRefObject, type RefObject } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import type { DraftConflictState } from '@/features/submissions/draft-editor/hooks/use-draft-conflict-resolution'
import type {
  CragImagePayload,
  DraftConflictResponse,
  DraftDeleteImageResponse,
  DraftPayload,
  DraftRoute,
  ManageImageTab,
} from '@/features/submissions/draft-editor/lib/edit-draft-types'
import type { MediaUploadItem, UploadCompleteCallback } from '@/features/submissions/upload/hooks/use-media-upload-manager'

interface UseEditDraftUploadsParams {
  draftId: string
  draft: DraftPayload | null
  draftUpdatedAt: string | null
  cragId: string | null
  activeImageId: string | null
  defaultImageId: string | null
  canvasSource: { kind: 'draft-image'; draftImageId: string } | { kind: 'crag-image'; cragImageId: string; cragId: string } | null
  addingImages: boolean
  removingImageId: string | null
  manageImages: ManageImageTab[]
  cragCanvasImages: CragImagePayload[]
  uploads: MediaUploadItem[]
  addImageInputRef: RefObject<HTMLInputElement | null>
  isFetchingRef: MutableRefObject<boolean>
  needsRefetchRef: MutableRefObject<boolean>
  setAddingImages: (value: boolean) => void
  setRemovingImageId: (value: string | null) => void
  setError: (value: string | null) => void
  setSuccess: (value: string | null) => void
  setDraftUpdatedAt: (value: string | null) => void
  setActiveImageId: (value: string | null | ((current: string | null) => string | null)) => void
  setDefaultImageId: (value: string | null | ((current: string | null) => string | null)) => void
  setCanvasSource: (value: { kind: 'draft-image'; draftImageId: string } | { kind: 'crag-image'; cragImageId: string; cragId: string } | null) => void
  setOrientationByImageId: React.Dispatch<React.SetStateAction<Record<string, import('@/features/submissions/lib/draft-metadata').OrientationDirection[]>>>
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  setConflict: (value: DraftConflictState | null) => void
  loadDraft: () => Promise<void>
  syncUploadedImages: () => Promise<void>
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  queueDraftUploads: (files: File[], draftId: string) => void
  isQueuePaused: (draftId?: string) => boolean
  subscribeToUploadComplete: (callback: UploadCompleteCallback) => () => void
  getUploadsForCrag: (cragId: string) => MediaUploadItem[]
  removeUpload: (clientId: string) => Promise<void>
}

export function useEditDraftUploads({
  draftId,
  draft,
  draftUpdatedAt,
  cragId,
  activeImageId,
  defaultImageId,
  canvasSource,
  addingImages,
  removingImageId,
  manageImages,
  cragCanvasImages,
  uploads,
  addImageInputRef,
  isFetchingRef,
  needsRefetchRef,
  setAddingImages,
  setRemovingImageId,
  setError,
  setSuccess,
  setDraftUpdatedAt,
  setActiveImageId,
  setDefaultImageId,
  setCanvasSource,
  setOrientationByImageId,
  setRoutesByImageId,
  setConflict,
  loadDraft,
  syncUploadedImages,
  registerDraftUpdatedAt,
  queueDraftUploads,
  isQueuePaused,
  subscribeToUploadComplete,
  getUploadsForCrag,
  removeUpload,
}: UseEditDraftUploadsParams) {
  const pendingDraftUploads = useMemo(() => draftId ? uploads.filter((upload) => upload.target.kind === 'draft' && upload.target.draftId === draftId) : [], [draftId, uploads])
  const queuePaused = useMemo(() => isQueuePaused(draftId || undefined), [draftId, isQueuePaused])
  const pendingCragUploads = useMemo(() => cragId ? getUploadsForCrag(cragId) : [], [cragId, getUploadsForCrag])

  const mergedCragCanvasImages = useMemo(() => {
    const persisted = cragCanvasImages
      .filter((image) => image.signed_url)
      .map<ManageImageTab>((image, index) => ({
        imageId: image.id,
        sourceKind: 'crag-image',
        index,
        label: `Crag image ${index + 1}`,
        signedUrl: image.signed_url || '',
        latitude: typeof image.latitude === 'number' ? image.latitude : null,
        longitude: typeof image.longitude === 'number' ? image.longitude : null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const optimistic = pendingCragUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !cragCanvasImages.some((img) => img.id === upload.attachedRecordId))
      .map<ManageImageTab>((upload) => ({
        imageId: upload.attachedRecordId || upload.clientId,
        sourceKind: 'crag-image',
        index: persisted.length,
        label: 'Crag image (syncing...)',
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pending = pendingCragUploads
      .filter((upload) => !upload.attachedRecordId)
      .map<ManageImageTab>((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'crag-image',
        index: persisted.length + optimistic.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...persisted, ...optimistic, ...pending]
  }, [cragCanvasImages, pendingCragUploads])

  const mergedManageImages = useMemo(() => {
    const optimisticTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !manageImages.some((img) => img.imageId === upload.attachedRecordId))
      .map((upload) => ({
        imageId: upload.attachedRecordId || upload.clientId,
        sourceKind: 'draft-image',
        index: manageImages.length,
        label: 'Image (syncing...)',
        signedUrl: upload.previewUrl || `/api/media/private?draftId=${draftId}&path=${encodeURIComponent(upload.uploadedPath || '')}`,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pendingTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => !upload.attachedRecordId)
      .map((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'draft-image',
        index: manageImages.length + optimisticTabs.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...manageImages, ...optimisticTabs, ...pendingTabs].sort((a, b) => a.index - b.index)
  }, [draftId, manageImages, pendingDraftUploads])

  const hasInFlightDraftUploads = useMemo(() => {
    return pendingDraftUploads.some((upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING')
  }, [pendingDraftUploads])

  useEffect(() => {
    if (!draftId) return
    const handleUploadComplete: UploadCompleteCallback = (_target, _clientId, attachedRecordId, newUpdatedAt) => {
      if (newUpdatedAt) {
        setDraftUpdatedAt(newUpdatedAt)
        registerDraftUpdatedAt(draftId, newUpdatedAt)
      }
      if (attachedRecordId) {
        setActiveImageId((current) => current || attachedRecordId)
        setDefaultImageId((current) => current || attachedRecordId)
      }
      if (isFetchingRef.current) {
        needsRefetchRef.current = true
        return
      }
      isFetchingRef.current = true
      needsRefetchRef.current = false
      void syncUploadedImages().finally(() => {
        isFetchingRef.current = false
        if (needsRefetchRef.current) {
          needsRefetchRef.current = false
          void syncUploadedImages()
        }
      })
    }
    return subscribeToUploadComplete(handleUploadComplete)
  }, [draftId, isFetchingRef, needsRefetchRef, registerDraftUpdatedAt, setActiveImageId, setDefaultImageId, setDraftUpdatedAt, subscribeToUploadComplete, syncUploadedImages])

  useEffect(() => {
    if (!cragId || activeImageId || canvasSource?.kind === 'draft-image') return
    const firstReadyCragImage = cragCanvasImages.find((image) => image.signed_url) || null
    if (!firstReadyCragImage?.id) return
    setActiveImageId(firstReadyCragImage.id)
    setCanvasSource({ kind: 'crag-image', cragImageId: firstReadyCragImage.id, cragId })
  }, [activeImageId, canvasSource, cragCanvasImages, cragId, setActiveImageId, setCanvasSource])

  const handleAddImages = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !draftId || !draftUpdatedAt || addingImages) return

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
      .slice(0, 20)
    if (files.length === 0) {
      setError('Select at least one image file')
      return
    }

    setAddingImages(true)
    setError(null)
    setSuccess(null)

    try {
      queueDraftUploads(files, draftId)
      setSuccess(`Added ${files.length} image${files.length === 1 ? '' : 's'} to draft`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add images')
    } finally {
      setAddingImages(false)
      if (addImageInputRef.current) {
        addImageInputRef.current.value = ''
      }
    }
  }, [addImageInputRef, addingImages, draftId, draftUpdatedAt, queueDraftUploads, setAddingImages, setError, setSuccess])

  const handleQuickBarDropFiles = useCallback((files: File[]) => {
    const fileListLike: { length: number; item: (index: number) => File | null; [key: number]: File } = {
      length: files.length,
      item: (index: number) => files[index] || null,
    }
    files.forEach((file, index) => {
      fileListLike[index] = file
    })
    void handleAddImages(fileListLike as unknown as FileList)
  }, [handleAddImages])

  const handleRemoveImage = useCallback(async (imageId: string) => {
    const pendingUpload = pendingDraftUploads.find((upload) => upload.clientId === imageId) || null
    if (pendingUpload) {
      setError(null)
      setSuccess(null)
      await removeUpload(pendingUpload.clientId)
      if (activeImageId === pendingUpload.clientId) {
        const fallbackImageId = mergedManageImages.find((image) => image.imageId !== pendingUpload.clientId)?.imageId || null
        setActiveImageId(fallbackImageId)
      }
      setSuccess('Image removed from draft')
      return
    }

    if (!draft || !draftUpdatedAt || removingImageId) return
    if (draft.images.length <= 1) {
      setError('A draft must keep at least one image')
      return
    }

    setRemovingImageId(imageId)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/images/${imageId}?expected_updated_at=${encodeURIComponent(draftUpdatedAt)}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({} as DraftDeleteImageResponse & DraftConflictResponse & { error?: string }))

      if (!response.ok) {
        if (response.status === 409 && payload.code === 'draft_conflict') {
          setConflict({
            serverUpdatedAt: payload.current_updated_at,
            lastEditorName: payload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: { images: [], metadata: {}, cragId },
          })
          return
        }

        throw new Error(payload.error || 'Failed to remove image')
      }

      const remainingImages = draft.images
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .filter((image) => image.id !== imageId)
      const fallbackImageId = remainingImages[0]?.id || null

      if (defaultImageId === imageId) {
        setDefaultImageId(fallbackImageId)
      }

      if (activeImageId === imageId) {
        setActiveImageId(defaultImageId && defaultImageId !== imageId ? defaultImageId : fallbackImageId)
      }

      setOrientationByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })
      setRoutesByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })

      await loadDraft()
      if (payload.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      }
      setSuccess('Image removed from draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setRemovingImageId(null)
    }
  }, [activeImageId, cragId, defaultImageId, draft, draftUpdatedAt, loadDraft, mergedManageImages, pendingDraftUploads, removeUpload, removingImageId, setActiveImageId, setConflict, setDefaultImageId, setDraftUpdatedAt, setError, setOrientationByImageId, setRemovingImageId, setRoutesByImageId, setSuccess])

  return {
    pendingDraftUploads,
    queuePaused,
    pendingCragUploads,
    mergedCragCanvasImages,
    mergedManageImages,
    hasInFlightDraftUploads,
    handleAddImages,
    handleQuickBarDropFiles,
    handleRemoveImage,
  }
}
