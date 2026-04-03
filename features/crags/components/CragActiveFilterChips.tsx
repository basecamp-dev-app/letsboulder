'use client'

import React from 'react'
import type { ActiveRouteFilterChip } from '@/features/crags/lib/crag-page-domain'

interface CragActiveFilterChipsProps {
  chips: ActiveRouteFilterChip[]
  onRemoveChip: (chip: ActiveRouteFilterChip) => void
}

const CragActiveFilterChips = React.memo(function CragActiveFilterChips({ chips, onRemoveChip }: CragActiveFilterChipsProps) {
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemoveChip(chip)}
          className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {chip.label} ×
        </button>
      ))}
    </div>
  )
})

export default CragActiveFilterChips
