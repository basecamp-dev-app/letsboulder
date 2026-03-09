'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImagePicker from '@/app/submit/components/ImagePicker'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { csrfFetch } from '@/hooks/useCsrf'
import type { ImageSelection } from '@/lib/submission-types'

interface DraftCreateResponse {
  draft?: {
    id: string
  }
  error?: string
}

interface UploadedImagePayload {
  uploadedBucket: string
  uploadedPath: string
  width: number
  height: number
}

export default function DraftIntakeView() {
  const router = useRouter()
  const { toasts, addToast, removeToast } = useToast()
  const [selectedImages, setSelectedImages] = useState<UploadedImagePayload[]>([])
  const [uploadsInFlight, setUploadsInFlight] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreateDraft = selectedImages.length > 0 && !submitting && !uploadsInFlight

  const selectedLabel = useMemo(() => {
    if (selectedImages.length === 0) return uploadsInFlight ? 'Uploading photos...' : 'No photos uploaded yet'
    return `${selectedImages.length} photo${selectedImages.length === 1 ? '' : 's'} uploaded`
  }, [selectedImages.length, uploadsInFlight])

  const handleImageSelect = useCallback((selection: ImageSelection | null) => {
    if (!selection) {
      setSelectedImages([])
      setError(null)
      return
    }

    if (selection.mode !== 'new') {
      setError('Only new uploads can be used for draft intake')
      return
    }

    const images = selection.images.map((image) => ({
      uploadedBucket: image.uploadedBucket,
      uploadedPath: image.uploadedPath,
      width: image.width,
      height: image.height,
    }))

    setSelectedImages(images)
    setError(null)
  }, [])

  const createDraft = useCallback(async () => {
    if (!canCreateDraft) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await csrfFetch('/api/submissions/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: selectedImages,
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

      addToast('Draft created. Continue editing in Draft Editor.', 'success')
      router.push(`/logbook/drafts/${payload.draft.id}/edit`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }, [addToast, canCreateDraft, router, selectedImages])

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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Start a new draft</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Upload photos first, then continue in Draft Editor to choose or create a crag, draw routes, invite collaborators, and publish.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            You can upload multiple photos at once, but they will all map to one pin, so they should show the same face or boulder area. Use a separate submission for a different face or area.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Upload photos</h2>
          <ImagePicker onSelect={handleImageSelect} onUploadingStateChange={setUploadsInFlight} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{selectedLabel}</p>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => { void createDraft() }}
            disabled={!canCreateDraft}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Creating draft...' : uploadsInFlight ? 'Uploading photos...' : 'Create draft and continue'}
          </button>
          <Link
            href="/logbook/submissions"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
