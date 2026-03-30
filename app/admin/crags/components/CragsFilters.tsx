'use client'

import { Search } from 'lucide-react'

interface CragsFiltersProps {
  search: string
  missingRegionCount: number
  missingRegionOnly: boolean
  onSearchChange: (value: string) => void
  onToggleMissingRegionOnly: () => void
}

export default function CragsFilters({
  missingRegionCount,
  missingRegionOnly,
  onSearchChange,
  onToggleMissingRegionOnly,
  search,
}: CragsFiltersProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-2xl font-bold text-white">Crags</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMissingRegionOnly}
          className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
            missingRegionOnly
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Missing Region Tag ({missingRegionCount})
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search crags..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
      </div>
    </div>
  )
}
