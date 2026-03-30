'use client'

import { ChevronRight, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface CragSortDialogProps {
  open: boolean
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  onOpenChange: (open: boolean) => void
  onRouteSortChange: (sort: 'sends' | 'grade') => void
}

export default function CragSortDialog({
  open,
  routeSort,
  onOpenChange,
  onRouteSortChange,
}: CragSortDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
          <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
          <DialogTitle className="text-base">Sort climbs</DialogTitle>
          <div className="size-9" />
        </div>
        <div className="space-y-2 p-4">
          <button type="button" onClick={() => onRouteSortChange('sends')} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'sends' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
            <span>Ascents</span>
            <ChevronRight className="size-4" />
          </button>
          <button type="button" onClick={() => onRouteSortChange('grade')} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'grade' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
            <span>Grade</span>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
