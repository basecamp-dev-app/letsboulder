'use client'

import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'

interface WorkstationHeaderProps {
  activeImageLabel: string
  routeCountLabel: string
  activeImageStatus?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  activeStatusLabel: string
  extraAction?: React.ReactNode
  addAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
  removeAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
}

export function WorkstationHeader({
  activeImageLabel,
  routeCountLabel,
  activeImageStatus,
  activeStatusLabel,
  extraAction,
  addAction,
  removeAction,
}: WorkstationHeaderProps) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white/95 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/95">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Route editor</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{activeImageLabel}</p>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{routeCountLabel}</span>
            {activeImageStatus && activeImageStatus !== 'SUCCESS' ? (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{activeStatusLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {extraAction}
          {addAction ? (
            <button
              type="button"
              onClick={addAction.onClick}
              disabled={addAction.loading || addAction.disabled}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {addAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Add photo
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-1 md:hidden">
        {removeAction ? (
          <button
            type="button"
            onClick={removeAction.onClick}
            disabled={removeAction.loading || removeAction.disabled}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
            aria-label="Delete current image"
          >
            {removeAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        ) : null}
        {addAction ? (
          <button
            type="button"
            onClick={addAction.onClick}
            disabled={addAction.loading || addAction.disabled}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Add photos"
          >
            {addAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
