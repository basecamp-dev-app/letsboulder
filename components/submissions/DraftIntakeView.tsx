'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImagePicker from '@/components/submissions/ImagePicker'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { csrfFetch } from '@/hooks/useCsrf'
import { useDraftUploadManager } from '@/lib/media/media-upload-manager'

interface DraftCreateResponse {
  draft?: {
    id: string
    updated_at?: string
  }
  error?: string
}

export default function DraftIntakeView() {
  const router = useRouter()
  const { toasts, addToast, removeToast } = useToast()
  const { queueDraftUploads, registerDraftUpdatedAt } = useDraftUploadManager()
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0 || creatingDraft) return

    setCreatingDraft(true)
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

      queueDraftUploads(files, payload.draft.id)
      router.replace(`/logbook/drafts/${payload.draft.id}/edit`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setCreatingDraft(false)
    }
  }, [addToast, creatingDraft, queueDraftUploads, registerDraftUpdatedAt, router])

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
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Select up to 20 photos.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Upload photos</h2>
          <ImagePicker onFilesSelected={handleFilesSelected} disabled={creatingDraft} />
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
