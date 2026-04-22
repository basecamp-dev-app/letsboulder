'use client'

import React from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
}

const CragSearchDialog = React.memo(function CragSearchDialog({
  open,
  onOpenChange,
  searchQuery,
  onSearchQueryChange,
  searchModalResults,
  routeLocationLabel,
  gradeSystem,
  getRouteDestination,
}: CragSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="icon" className="rounded-full border-stone-200 text-stone-600 shadow-none hover:bg-stone-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <span className="sr-only">Close route search</span>
              <X className="size-4" />
            </Button>
          </DialogClose>
          <DialogTitle className="text-base">Search routes</DialogTitle>
          <div className="size-9" />
        </div>
        <div className="p-4">
          <Input value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search routes by name, grade, or type" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Routes</p>
              <div role="list" aria-label="Matching routes" className="space-y-2">
                {searchQuery.trim().length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">Search routes in this crag by name, grade, or type.</p> : searchModalResults.length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">No routes matched &quot;{searchQuery.trim()}&quot; in this crag.</p> : searchModalResults.map((route) => {
                  const destination = getRouteDestination(route)
                  const content = (
                    <>
                      <span>{route.name} <span className="text-stone-500">{formatGradeForDisplay(route.grade, gradeSystem)}</span></span>
                      <ChevronRight className="size-4 text-stone-400" />
                    </>
                  )

                  return (
                    <a key={route.id} href={destination.href} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      {content}
                    </a>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Scope</p>
              <p className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 dark:border-gray-700 dark:text-gray-300">Searching within {routeLocationLabel}.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})

export default CragSearchDialog
