'use client'

import { Loader2, Search } from 'lucide-react'

interface LocationSearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  onSearch: () => void
  searching: boolean
  error: string | null
}

export function LocationSearchBar({ query, onQueryChange, onSearch, searching, error }: LocationSearchBarProps) {
  return (
    <>
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSearch()
              }
            }}
            placeholder="Search for a location..."
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Search
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </>
  )
}
