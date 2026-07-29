import { ArrowUpDown, ChevronDown, Filter, Search } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CragOfflinePackControl from '@/features/offline/components/CragOfflinePackControl'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export interface CragSwitcherOption {
  id: string
  name: string
  slug: string | null
  regionName: string | null
  subArea: string | null
  countryCode: string | null
}

interface CragPageToolbarProps {
  crag: CragPageCrag
  cragSwitcherOpen: boolean
  cragSwitcherQuery: string
  cragSwitcherOptions: CragSwitcherOption[]
  saveLoading: boolean
  saveDisabled: boolean
  savePendingLabel: string
  isSaved: boolean
  hasActiveRouteFilters: boolean
  selectedImageId: string | null
  selectedRouteCount: number
  routesCount: number
  onToggleCragSwitcher: () => void
  onCragSwitcherQueryChange: (value: string) => void
  onCloseCragSwitcher: () => void
  onToggleSaveCrag: () => void
  onOpenSearchModal: () => void
  onOpenFilterModal: () => void
  onOpenSortModal: () => void
  onClearRouteFilters: () => void
}

function getCragSwitcherHref(option: CragSwitcherOption) {
  if (!option.slug || !option.countryCode) return `/crag/${option.id}`

  return `/${option.countryCode.toLowerCase()}/${option.slug}`
}

export default function CragPageToolbar({
  crag,
  cragSwitcherOpen,
  cragSwitcherQuery,
  cragSwitcherOptions,
  saveLoading,
  saveDisabled,
  savePendingLabel,
  isSaved,
  hasActiveRouteFilters,
  selectedImageId,
  selectedRouteCount,
  routesCount,
  onToggleCragSwitcher,
  onCragSwitcherQueryChange,
  onCloseCragSwitcher,
  onToggleSaveCrag,
  onOpenSearchModal,
  onOpenFilterModal,
  onOpenSortModal,
  onClearRouteFilters,
}: CragPageToolbarProps) {
  const actionButtonClassName = 'min-h-11 rounded-full border-stone-200 bg-stone-50 px-3 text-stone-700 shadow-none hover:bg-stone-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
  const switcherListboxId = useId()
  const switcherSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!cragSwitcherOpen) return
    switcherSearchInputRef.current?.focus()
  }, [cragSwitcherOpen])

  const handleSwitcherKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    if (!cragSwitcherOpen) {
      onToggleCragSwitcher()
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 max-w-sm">
          <Button type="button" variant="outline" onClick={onToggleCragSwitcher} onKeyDown={handleSwitcherKeyDown} aria-expanded={cragSwitcherOpen} aria-controls={cragSwitcherOpen ? switcherListboxId : undefined} aria-haspopup="listbox" className="min-h-11 w-full justify-between rounded-xl border-stone-200 bg-stone-50 px-3 text-left text-sm font-medium text-stone-700 shadow-none hover:bg-stone-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
            <span className="truncate font-medium">{crag.name}</span>
            <ChevronDown className="size-4 shrink-0" />
          </Button>
          {cragSwitcherOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[1300] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <Input ref={switcherSearchInputRef} value={cragSwitcherQuery} onChange={(event) => onCragSwitcherQueryChange(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCloseCragSwitcher()
                }
              }} placeholder="Search another crag" aria-label="Search another crag" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
              <div id={switcherListboxId} role="listbox" aria-label="Available crags" className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {cragSwitcherOptions.map((option) => {
                  const href = getCragSwitcherHref(option)
                  return (
                    <a key={option.id} role="option" aria-selected={option.id === crag.id} aria-current={option.id === crag.id ? 'page' : undefined} href={option.id === crag.id ? `/crag/${option.id}` : href} className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-stone-50 dark:hover:bg-gray-800 ${option.id === crag.id ? 'bg-stone-100 font-medium text-stone-900 dark:bg-gray-800 dark:text-gray-100' : 'text-stone-700 dark:text-gray-200'}`} onClick={onCloseCragSwitcher}>
                      <div>{option.name}</div>
                      <div className="text-xs text-stone-500 dark:text-gray-400">{option.subArea || option.regionName || 'Crag'}</div>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <Button type="button" variant="outline" onClick={onToggleSaveCrag} disabled={saveDisabled} aria-label={isSaved ? 'Remove saved crag' : 'Save crag'} aria-pressed={isSaved} title={isSaved ? 'Remove saved crag' : 'Save crag'} className={isSaved ? 'min-h-11 rounded-full border-amber-200 bg-amber-50 px-3 text-amber-900 shadow-none hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50' : actionButtonClassName}>
          <span>{saveLoading ? savePendingLabel : isSaved ? 'Saved crag' : 'Save crag'}</span>
        </Button>
        <CragOfflinePackControl cragId={crag.id} />
        <Button type="button" variant="outline" onClick={onOpenSearchModal} aria-label="Search routes" title="Search routes" className={actionButtonClassName}>
          <Search className="size-4" />
          <span>Search</span>
        </Button>
        <Button type="button" variant="outline" onClick={onOpenFilterModal} aria-label="Filter routes" title="Filter routes" className={actionButtonClassName}>
          <Filter className="size-4" />
          <span>Filter</span>
        </Button>
        <Button type="button" variant="outline" onClick={onOpenSortModal} aria-label="Sort routes" title="Sort routes" className={actionButtonClassName}>
          <ArrowUpDown className="size-4" />
          <span>Sort</span>
        </Button>
        {hasActiveRouteFilters ? (
          <Button type="button" variant="outline" onClick={onClearRouteFilters} className="min-h-11 rounded-full border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 shadow-none hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            Clear filters
          </Button>
        ) : null}
        <div className="ml-auto text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400 max-sm:w-full max-sm:ml-0">
          {selectedImageId ? `${selectedRouteCount} / ${routesCount} selected` : ''}
          {selectedImageId ? ' · ' : ''}
          {routesCount} routes
        </div>
      </div>
    </div>
  )
}
