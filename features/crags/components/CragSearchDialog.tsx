'use client'

import { ChevronRight, X } from 'lucide-react'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'
import { Input } from '@/components/ui/input'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'

interface CragSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  searchModalResults: CragRoute[]
  routeLocationLabel: string
  gradeSystem: GradeSystem
  getRouteDestination: (route: CragRoute) => { href: string; ready: boolean }
  onPendingRouteNavigation: (event: React.MouseEvent<HTMLButtonElement>, route: CragRoute) => void
}

export default function CragSearchDialog({
  open,
  onOpenChange,
  searchQuery,
  onSearchQueryChange,
  searchModalResults,
  routeLocationLabel,
  gradeSystem,
  getRouteDestination,
  onPendingRouteNavigation,
}: CragSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
          <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
          <DialogTitle className="text-base">Search climbs, areas, subareas</DialogTitle>
          <div className="size-9" />
        </div>
        <div className="p-4">
          <Input value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search climbs here" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climbs</p>
              <div className="space-y-2">
                {searchModalResults.length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">No climbs match yet.</p> : searchModalResults.map((route) => {
                  const destination = getRouteDestination(route)
                  const content = (
                    <>
                      <span>{route.name} <span className="text-stone-500">{formatGradeForDisplay(route.grade, gradeSystem)}</span></span>
                      <ChevronRight className="size-4 text-stone-400" />
                    </>
                  )

                  if (!destination.ready) {
                    return (
                      <button key={route.id} type="button" onClick={(event) => onPendingRouteNavigation(event, route)} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                        {content}
                      </button>
                    )
                  }

                  return (
                    <a key={route.id} href={destination.href} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      {content}
                    </a>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Area</p>
              <p className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 dark:border-gray-700 dark:text-gray-300">{routeLocationLabel}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
