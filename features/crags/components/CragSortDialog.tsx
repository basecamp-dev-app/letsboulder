'use client'

import React from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface CragSortDialogProps {
  open: boolean
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  onOpenChange: (open: boolean) => void
  onRouteSortChange: (sort: 'sends' | 'grade') => void
}

const CragSortDialog = React.memo(function CragSortDialog({
  open,
  routeSort,
  onOpenChange,
  onRouteSortChange,
}: CragSortDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="icon" className="rounded-full border-stone-200 text-stone-600 shadow-none hover:bg-stone-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <X className="size-4" />
            </Button>
          </DialogClose>
          <DialogTitle className="text-base">Sort climbs</DialogTitle>
          <div className="size-9" />
        </div>
        <div className="space-y-2 p-4">
          <Button type="button" variant={routeSort === 'sends' ? 'default' : 'outline'} onClick={() => onRouteSortChange('sends')} className={`h-auto w-full justify-between rounded-xl px-3 py-3 text-sm ${routeSort === 'sends' ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800' : 'border-stone-200 bg-white text-stone-700 shadow-none hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}>
            <span>Ascents</span>
            <ChevronRight className="size-4" />
          </Button>
          <Button type="button" variant={routeSort === 'grade' ? 'default' : 'outline'} onClick={() => onRouteSortChange('grade')} className={`h-auto w-full justify-between rounded-xl px-3 py-3 text-sm ${routeSort === 'grade' ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800' : 'border-stone-200 bg-white text-stone-700 shadow-none hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}>
            <span>Grade</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

export default CragSortDialog
