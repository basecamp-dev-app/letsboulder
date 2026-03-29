'use client'

import Link from 'next/link'
import { Loader2, Trash2 } from 'lucide-react'

interface DraftToolbarProps {
  savingDraft: boolean
  publishingDraft: boolean
  hasConflict: boolean
  isOwner: boolean
  draftId: string
  hasPendingUploads: (draftId: string) => boolean
  hasFailedUploads: (draftId: string) => boolean
  onManualSave: () => void
  onPublish: () => void
  onDeleteDraft: () => void
  autosaveState: 'idle' | 'pending' | 'saving' | 'syncing' | 'saved'
}

export function DraftToolbar({
  savingDraft,
  publishingDraft,
  hasConflict,
  isOwner,
  draftId,
  hasPendingUploads,
  hasFailedUploads,
  onManualSave,
  onPublish,
  onDeleteDraft,
  autosaveState,
}: DraftToolbarProps) {
  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/80 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/logbook"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to logbook
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onManualSave}
              disabled={savingDraft || publishingDraft || hasConflict}
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save draft
            </button>
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={publishingDraft || savingDraft || hasConflict || Boolean(draftId && (hasPendingUploads(draftId) || hasFailedUploads(draftId)))}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {publishingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Publish
                </button>
                <button
                  type="button"
                  onClick={onDeleteDraft}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete draft
                </button>
              </>
            ) : (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Waiting for owner to publish
              </span>
            )}
          </div>
        </div>
      </div>

      {autosaveState !== 'idle' ? (
        <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          {autosaveState === 'pending'
            ? 'Autosave queued...'
            : autosaveState === 'saving'
              ? 'Autosaving...'
              : autosaveState === 'syncing'
                ? 'Syncing...'
                : 'Autosaved'}
        </div>
      ) : null}
    </>
  )
}
