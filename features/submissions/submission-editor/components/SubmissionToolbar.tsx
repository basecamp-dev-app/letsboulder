'use client'

import { Loader2 } from 'lucide-react'
import { EditorBackButton } from '@/features/editor/components/EditorBackButton'

interface SubmissionToolbarProps {
  hasPendingChanges: boolean
  savingAllChanges: boolean
  onSaveAllChanges: () => void
}

export function SubmissionToolbar({ hasPendingChanges, savingAllChanges, onSaveAllChanges }: SubmissionToolbarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/80 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
      <div className="flex items-center justify-between gap-3">
        <EditorBackButton isDirty={hasPendingChanges} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
            {savingAllChanges ? 'Saving...' : hasPendingChanges ? 'Unsaved changes' : 'Saved'}
          </span>
          <button
            type="button"
            onClick={onSaveAllChanges}
            disabled={!hasPendingChanges || savingAllChanges}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingAllChanges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save all changes
          </button>
        </div>
      </div>
    </div>
  )
}
