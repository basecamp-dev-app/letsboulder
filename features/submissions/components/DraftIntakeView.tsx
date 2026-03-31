'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/features/logbook/components/toast'
import ImagePicker from '@/features/submissions/components/ImagePicker'
import { csrfFetch } from '@/hooks/useCsrf'
import { useDraftUploadManager } from '@/features/submissions/upload/hooks/use-draft-upload-manager'
import type { MediaUploadItem } from '@/features/submissions/upload/lib/upload-types'

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
  const { queueDraftUploads, registerDraftUpdatedAt, getUploadsForDraft, subscribeToUploadComplete, resumeQueue, retryUpload, removeUpload } = useDraftUploadManager()
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploads = draftId ? getUploadsForDraft(draftId) : []

  useEffect(() => {
    if (phase !== 'uploading' || uploads.length === 0) return

    const allDone = uploads.every((u) => u.status === 'SUCCESS' || u.status === 'FAILED')
    if (allDone) {
      const allSuccess = uploads.every((u) => u.status === 'SUCCESS')
      setPhase(allSuccess ? 'complete' : 'failed')
    }
  }, [uploads, phase])

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0 || phase !== 'idle') return

    setPhase('creating')
    setError(null)

    try {
      const response = await csrfFetch('/api/submissions/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: [],
          metadata: {
            primaryIndex: 0,
            intake: {
              source: '/submit',
              createdAt: new Date().toISOString(),
            },
          },
        }),
      })

      const payload = await response.json().catch(() => ({} as DraftCreateResponse))
      if (!response.ok || !payload.draft?.id) {
        throw new Error(payload.error || 'Failed to create draft')
      }

      if (payload.draft.updated_at) registerDraftUpdatedAt(payload.draft.id, payload.draft.updated_at)

      setDraftId(payload.draft.id)
      queueDraftUploads(files, payload.draft.id)
      setPhase('uploading')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      setError(message)
      addToast(message, 'error')
      setPhase('idle')
    }
  }, [addToast, phase, queueDraftUploads, registerDraftUpdatedAt, getUploadsForDraft])

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
    setPhase('idle')
    setError(null)
  }, [draftId, uploads, removeUpload])

  const handleOpenEditor = useCallback(() => {
    if (!draftId) return
    router.replace(`/logbook/drafts/${draftId}/edit`)
  }, [draftId, router])

  const successCount = uploads.filter((u) => u.status === 'SUCCESS').length
  const failedCount = uploads.filter((u) => u.status === 'FAILED').length
  const totalCount = uploads.length

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

        {phase === 'idle' && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Upload photos</h2>
            <ImagePicker onFilesSelected={handleFilesSelected} disabled={phase !== 'idle'} />
          </div>
        )}

        {(phase === 'creating' || phase === 'uploading') && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {phase === 'creating' ? 'Creating draft...' : `Uploading ${totalCount} photo${totalCount > 1 ? 's' : ''}...`}
              </h2>
            </div>

            <div className="space-y-3">
              {uploads.map((upload) => (
                <div key={upload.clientId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-gray-700 dark:text-gray-300">{upload.fileName}</span>
                    <span className={`ml-2 shrink-0 ${
                      upload.status === 'SUCCESS' ? 'text-green-600 dark:text-green-400' :
                      upload.status === 'FAILED' ? 'text-red-600 dark:text-red-400' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      {upload.status === 'SUCCESS' ? 'Done' :
                       upload.status === 'FAILED' ? 'Failed' :
                       upload.status === 'UPLOADING' ? `${upload.progress}%` :
                       upload.status === 'PREPROCESSING' ? 'Preparing...' :
                       'Waiting...'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        upload.status === 'SUCCESS' ? 'bg-green-500' :
                        upload.status === 'FAILED' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {successCount} of {totalCount} complete
              {failedCount > 0 && `, ${failedCount} failed`}
            </p>
          </div>
        )}

        {phase === 'complete' && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <h2 className="mb-2 text-sm font-semibold text-green-800 dark:text-green-200">
              All {totalCount} photo{totalCount > 1 ? 's' : ''} uploaded successfully!
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenEditor}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Open in Editor →
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
              >
                Upload more
              </button>
            </div>
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
              {successCount > 0 && (
                <button
                  type="button"
                  onClick={handleOpenEditor}
                  className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  Continue with {successCount} photo{successCount > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}

        {error && phase === 'idle' ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
