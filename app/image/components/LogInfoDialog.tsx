'use client'

import { X } from 'lucide-react'

interface LogInfoDialogProps {
  open: boolean
  onClose: () => void
}

export default function LogInfoDialog({ open, onClose }: LogInfoDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold text-gray-900 dark:text-white">Log types</p>
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 dark:hover:bg-gray-900 dark:text-gray-300 dark:hover:text-white"
            aria-label="Close info"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Flash</p>
            <p className="text-gray-600 dark:text-gray-400">Sent first try.</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Top</p>
            <p className="text-gray-600 dark:text-gray-400">Sent (not first try).</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Try</p>
            <p className="text-gray-600 dark:text-gray-400">Attempted but not sent.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
