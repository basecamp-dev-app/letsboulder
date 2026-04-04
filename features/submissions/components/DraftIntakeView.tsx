'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { GripHorizontal, Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/features/logbook/components/Toast'
import { createSubmissionDraftAction } from '@/features/submissions/actions/manage-submissions'
import ImagePicker from '@/features/submissions/components/ImagePicker'
import { csrfFetch } from '@/hooks/useCsrf'
import { useDraftUploadManager } from '@/features/submissions/upload/hooks/use-draft-upload-manager'
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface DraftIntakeImage {
  id: string
  imageId: string | null
  previewUrl: string
  label: string
  status: 'attached' | 'uploading' | 'failed'
  progress?: number
}

interface DraftImageRecord {
  id: string
  display_order: number
  proxy_url: string | null
}

interface DraftThumbnailResponse {
  draft?: {
    id: string
    updated_at: string
    images: DraftImageRecord[]
  }
  error?: string
}

interface DraftPatchResponse {
  draft?: {
    updated_at?: string
  }
  error?: string
}

function SortableDraftThumb({ image }: { image: DraftIntakeImage }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: image.id,
    disabled: image.status !== 'attached',
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
      {...attributes}
      {...listeners}
    >
      <Image src={image.previewUrl} alt={image.label} fill unoptimized sizes="80px" className="object-cover" />
      {image.status === 'attached' ? (
        <GripHorizontal className="absolute bottom-1 right-1 z-10 h-3.5 w-3.5 rounded-full bg-black/55 p-[2px] text-white" />
      ) : null}
      <span className="absolute left-1 top-1 z-10 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
        {image.label}
      </span>
      {image.status !== 'attached' ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-black/60 px-1.5 py-1 text-[10px] font-medium text-white">
          {image.status === 'failed' ? 'Failed' : `${image.progress || 0}%`}
        </div>
      ) : null}
    </div>
  )
}

interface DraftCreateResponse {
  draft?: {
    id: string
    updated_at?: string
  }
  error?: string
}

type UploadPhase = 'idle' | 'creating' | 'uploading' | 'complete' | 'failed'

export default function DraftIntakeView() {
  const router = useRouter()
  const { toasts, addToast, removeToast } = useToast()
  const { queueDraftUploads, registerDraftUpdatedAt, getUploadsForDraft, resumeQueue, retryUpload, removeUpload } = useDraftUploadManager()
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftImages, setDraftImages] = useState<DraftImageRecord[]>([])
  const draftUpdatedAtRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  const uploads = useMemo(() => (draftId ? getUploadsForDraft(draftId) : []), [draftId, getUploadsForDraft])
  const attachedUploads = useMemo(() => uploads.filter((upload) => upload.attachedRecordId), [uploads])
  const uploadThumbs = useMemo<DraftIntakeImage[]>(() => {
    const attachedRecordIds = new Set(draftImages.map((image) => image.id))

    return uploads
      .filter((upload) => upload.previewUrl)
      .filter((upload) => !upload.attachedRecordId || !attachedRecordIds.has(upload.attachedRecordId))
      .map((upload, index) => ({
        id: upload.clientId,
        imageId: upload.attachedRecordId,
        previewUrl: upload.previewUrl,
        label: `+${index + 1}`,
        status: upload.status === 'FAILED' ? 'failed' : 'uploading',
        progress: upload.progress,
      }))
  }, [draftImages, uploads])
  const galleryImages = useMemo<DraftIntakeImage[]>(() => ([
    ...draftImages.map((image, index) => ({
      id: image.id,
      imageId: image.id,
      previewUrl: image.proxy_url || '',
      label: String(index + 1),
      status: 'attached' as const,
    })),
    ...uploadThumbs,
  ]).filter((image) => image.previewUrl), [draftImages, uploadThumbs])
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  )

  const loadDraftImages = useCallback(async (targetDraftId: string) => {
    const response = await csrfFetch(`/api/submissions/drafts/${targetDraftId}`)
    const payload = await response.json().catch(() => ({} as DraftThumbnailResponse))
    if (!response.ok || !payload.draft) {
      throw new Error(payload.error || 'Failed to load draft photos')
    }

    setDraftImages((payload.draft.images || []).slice().sort((a: DraftImageRecord, b: DraftImageRecord) => a.display_order - b.display_order))
    draftUpdatedAtRef.current = payload.draft.updated_at
    registerDraftUpdatedAt(payload.draft.id, payload.draft.updated_at)
  }, [registerDraftUpdatedAt])

  useEffect(() => {
    if (phase !== 'uploading' || uploads.length === 0) return

      const allDone = uploads.every((u) => u.status === 'SUCCESS' || u.status === 'FAILED')
      if (allDone) {
        const allSuccess = uploads.every((u) => u.status === 'SUCCESS')
        setPhase(allSuccess ? 'complete' : 'failed')
      }
  }, [uploads, phase])

  useEffect(() => {
    if (!draftId) return
    if (attachedUploads.length === 0) return
    void loadDraftImages(draftId).catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to refresh draft photos'
      setError(message)
    })
  }, [attachedUploads.length, draftId, loadDraftImages])

  const handleRetryFailed = useCallback(() => {
    if (!draftId) return
    const failedUploads = uploads.filter((u) => u.status === 'FAILED')
    failedUploads.forEach((u) => retryUpload(u.clientId))
    resumeQueue()
    setPhase('uploading')
    setError(null)
  }, [draftId, uploads, retryUpload, resumeQueue])

  const handleReset = useCallback(() => {
    if (!draftId) return
    uploads.forEach((u) => { void removeUpload(u.clientId) })
    setDraftId(null)
    setDraftImages([])
    setPhase('idle')
    setError(null)
  }, [draftId, uploads, removeUpload])

  const handleOpenEditor = useCallback(() => {
    if (!draftId) return
    router.replace(`/logbook/drafts/${draftId}/edit`)
  }, [draftId, router])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    if (draftId) {
      queueDraftUploads(files, draftId)
      setPhase('uploading')
      setError(null)
      return
    }

    setPhase('creating')
    setError(null)

    try {
      const result = await createSubmissionDraftAction({
        images: [],
        metadata: {
          primaryIndex: 0,
          intake: {
            source: '/submit',
            createdAt: new Date().toISOString(),
          },
        },
      })

      const payload = result.success && result.data
        ? ({ draft: result.data } as DraftCreateResponse)
        : ({ error: result.error } as DraftCreateResponse)
      if (!result.success || !payload.draft?.id) {
        throw new Error(payload.error || 'Failed to create draft')
      }

      if (payload.draft.updated_at) registerDraftUpdatedAt(payload.draft.id, payload.draft.updated_at)
      draftUpdatedAtRef.current = payload.draft.updated_at || null

      setDraftId(payload.draft.id)
      setDraftImages([])
      queueDraftUploads(files, payload.draft.id)
      setPhase('uploading')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      setError(message)
      addToast(message, 'error')
      setPhase('idle')
    }
  }, [addToast, draftId, queueDraftUploads, registerDraftUpdatedAt])

  const handleReorder = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!draftId || !over || active.id === over.id || reordering) return

    const oldIndex = draftImages.findIndex((image) => image.id === active.id)
    const newIndex = draftImages.findIndex((image) => image.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const nextImages = arrayMove(draftImages, oldIndex, newIndex).map((image, index) => ({
      ...image,
      display_order: index,
    }))

    setDraftImages(nextImages)
    setReordering(true)
    setError(null)

    try {
      const expectedUpdatedAt = draftUpdatedAtRef.current
      if (!expectedUpdatedAt) {
        throw new Error('Draft timestamp is missing. Refresh the page and try again.')
      }

      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: expectedUpdatedAt,
          images: nextImages.map((image) => ({
            id: image.id,
            display_order: image.display_order,
            route_data: {},
          })),
        }),
      })

      const payload = await response.json().catch(() => ({ error: 'Failed to reorder draft photos' })) as DraftPatchResponse
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to reorder draft photos')
      }

      if (payload.draft?.updated_at) {
        draftUpdatedAtRef.current = payload.draft.updated_at
        registerDraftUpdatedAt(draftId, payload.draft.updated_at)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder draft photos'
      setError(message)
      addToast(message, 'error')
      void loadDraftImages(draftId).catch(() => null)
    } finally {
      setReordering(false)
    }
  }, [addToast, draftId, draftImages, loadDraftImages, registerDraftUpdatedAt, reordering])

  const successCount = uploads.filter((u) => u.status === 'SUCCESS').length
  const failedCount = uploads.filter((u) => u.status === 'FAILED').length
  const totalCount = uploads.length
  const hasInFlightUploads = uploads.some((upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING')
  const hasAnyImages = galleryImages.length > 0
  const hasAttachedImages = draftImages.length > 0
  const canContinueToEditor = hasAttachedImages && !hasInFlightUploads

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <Link href="/logbook/submissions" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
            ← Back to submissions
          </Link>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Start a new draft.</h1>
        </div>

        {(phase === 'idle' || phase === 'creating' || phase === 'uploading' || phase === 'complete' || phase === 'failed') && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Upload photos</h2>
            <ImagePicker onFilesSelected={handleFilesSelected} disabled={phase === 'creating'} />

            {phase === 'creating' ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                Creating draft...
              </div>
            ) : null}

            {draftId ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft photos</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Upload more anytime. Drag attached photos to reorder them before opening the editor.
                    </p>
                  </div>
                  {(phase === 'uploading' || reordering) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {reordering ? 'Saving order' : 'Uploading'}
                    </span>
                  ) : null}
                </div>

                {hasAnyImages ? (
                  <div className="overflow-x-auto pb-1">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
                      <SortableContext items={draftImages.map((image) => image.id)} strategy={horizontalListSortingStrategy}>
                        <div className="flex gap-2">
                          {galleryImages.map((image) => (
                            <SortableDraftThumb key={image.id} image={image} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                ) : null}

                {totalCount > 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {successCount} of {totalCount} complete
                    {failedCount > 0 && `, ${failedCount} failed`}
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleOpenEditor}
                    disabled={!canContinueToEditor}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasInFlightUploads ? 'Finish uploads to continue' : 'Continue to editor'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Start over
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {phase === 'failed' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <h2 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              Uploads complete with errors
            </h2>
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">
              {successCount} of {totalCount} uploaded successfully. {failedCount} failed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRetryFailed}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Retry failed
              </button>
              {successCount > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenEditor}
                  className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  Continue with {successCount} photo{successCount > 1 ? 's' : ''}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
