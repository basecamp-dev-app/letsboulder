'use client'

import type { MediaUploadItem } from '@/features/media-upload/lib/upload-types'

interface DraftUploadQueueProps {
  pendingDraftUploads: MediaUploadItem[]
  queuePaused: boolean
  draftId: string
  hasPendingUploads: (draftId: string) => boolean
  hasFailedUploads: (draftId: string) => boolean
  onRetryUpload: (clientId: string) => void
  onRemoveUpload: (clientId: string) => void
  onResumeQueue: () => void
}

export function DraftUploadQueue({
  pendingDraftUploads,
  queuePaused,
  draftId,
  hasPendingUploads,
  hasFailedUploads,
  onRetryUpload,
  onRemoveUpload,
  onResumeQueue,
}: DraftUploadQueueProps) {
  if (pendingDraftUploads.length === 0) return null

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Background uploads</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Photos appear in the gallery as each upload finishes. Failed uploads are skipped — retry or delete them below.
          </p>
        </div>
        {queuePaused ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Queue paused
          </span>
        ) : draftId && hasPendingUploads(draftId) ? (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            Uploading
          </span>
        ) : draftId && hasFailedUploads(draftId) ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Attention needed
          </span>
        ) : null}
      </div>
      {queuePaused ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span>The upload queue is paused. Resume to continue processing remaining uploads.</span>
          <button
            type="button"
            onClick={onResumeQueue}
            className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
          >
            Resume
          </button>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        {pendingDraftUploads.filter((upload) => !upload.attachedRecordId).map((upload) => (
          <div key={upload.clientId} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
              {upload.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upload.previewUrl} alt={upload.fileName} className="h-full w-full object-cover opacity-80" draggable={false} />
              ) : (
                <div className="h-full w-full animate-pulse bg-gray-200 dark:bg-gray-700" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{upload.fileName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {upload.status === 'FAILED'
                  ? upload.error || 'Upload failed'
                  : upload.status === 'QUEUED'
                    ? 'Waiting in queue'
                    : upload.status === 'PREPROCESSING'
                      ? 'Preparing image'
                      : `Uploading ${upload.progress}%`}
              </p>
            </div>
            {upload.status === 'FAILED' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRetryUpload(upload.clientId)}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveUpload(upload.clientId)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="w-20">
                {upload.status === 'UPLOADING' ? (
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${upload.progress}%` }} />
                  </div>
                ) : upload.status === 'PREPROCESSING' ? (
                  <div className="h-2 rounded-full bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 dark:from-gray-700 dark:via-gray-500 dark:to-gray-700" />
                ) : (
                  <div className="rounded-full bg-gray-100 px-2 py-1 text-center text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                    Queued
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
