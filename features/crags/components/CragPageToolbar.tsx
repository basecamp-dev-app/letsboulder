'use client'

import { ArrowUpDown, ChevronDown, Download, Filter, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Crag } from '@/features/crags/lib/crag-page-types'

export interface CragSwitcherOption {
  id: string
  name: string
  regionName: string | null
  subArea: string | null
  countryCode: string | null
}

interface CragPageToolbarProps {
  crag: Crag
  cragSwitcherOpen: boolean
  cragSwitcherQuery: string
  cragSwitcherOptions: CragSwitcherOption[]
  canDownloadCrag: boolean
  offlineDialogLoading: boolean
  offlinePreviewLoading: boolean
  hasActiveRouteFilters: boolean
  selectedImageId: string | null
  selectedRouteCount: number
  routesCount: number
  onToggleCragSwitcher: () => void
  onCragSwitcherQueryChange: (value: string) => void
  onCloseCragSwitcher: () => void
  onOpenOfflineDialog: () => void
  onOpenSearchModal: () => void
  onOpenFilterModal: () => void
  onOpenSortModal: () => void
  onClearRouteFilters: () => void
}

function getCragSwitcherHref(option: CragSwitcherOption) {
  if (!option.countryCode) return `/crag/${option.id}`

  return `/${option.countryCode.toLowerCase()}/${option.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
}

export default function CragPageToolbar({
  crag,
  cragSwitcherOpen,
  cragSwitcherQuery,
  cragSwitcherOptions,
  canDownloadCrag,
  offlineDialogLoading,
  offlinePreviewLoading,
  hasActiveRouteFilters,
  selectedImageId,
  selectedRouteCount,
  routesCount,
  onToggleCragSwitcher,
  onCragSwitcherQueryChange,
  onCloseCragSwitcher,
  onOpenOfflineDialog,
  onOpenSearchModal,
  onOpenFilterModal,
  onOpenSortModal,
  onClearRouteFilters,
}: CragPageToolbarProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 max-w-sm">
          <button type="button" onClick={onToggleCragSwitcher} className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <span className="truncate font-medium">{crag.name}</span>
            <ChevronDown className="size-4 shrink-0" />
          </button>
          {cragSwitcherOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[1300] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <Input value={cragSwitcherQuery} onChange={(event) => onCragSwitcherQueryChange(event.target.value)} placeholder="Search another crag" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {cragSwitcherOptions.map((option) => {
                  const href = getCragSwitcherHref(option)
                  return (
                    <a key={option.id} href={option.id === crag.id ? `/crag/${option.id}` : href} className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-stone-50 dark:hover:bg-gray-800 ${option.id === crag.id ? 'bg-stone-100 font-medium text-stone-900 dark:bg-gray-800 dark:text-gray-100' : 'text-stone-700 dark:text-gray-200'}`} onClick={onCloseCragSwitcher}>
                      <div>{option.name}</div>
                      <div className="text-xs text-stone-500 dark:text-gray-400">{option.subArea || option.regionName || 'Crag'}</div>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onOpenOfflineDialog} disabled={!canDownloadCrag} className="rounded-full border border-stone-200 bg-white p-2.5 text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
          {offlineDialogLoading || offlinePreviewLoading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </button>
        <button type="button" onClick={onOpenSearchModal} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <Search className="size-4" />
        </button>
        <button type="button" onClick={onOpenFilterModal} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <Filter className="size-4" />
        </button>
        <button type="button" onClick={onOpenSortModal} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <ArrowUpDown className="size-4" />
        </button>
        {hasActiveRouteFilters ? (
          <button type="button" onClick={onClearRouteFilters} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            Clear filters
          </button>
        ) : null}
        <div className="ml-auto text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">
          {selectedImageId ? `${selectedRouteCount} / ${routesCount} selected` : ''}
          {selectedImageId ? ' · ' : ''}
          {routesCount} routes
        </div>
      </div>
    </div>
  )
}
