'use client'

import React from 'react'
import { X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { PUBLIC_GRADES } from '@/lib/grades'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatRouteTypeLabel, type CragRouteStats } from '@/features/crags/lib/crag-page-domain'

const GradeDistributionChart = dynamic(
  () => import('@/features/crags/components/GradeDistributionChart'),
  { ssr: false, loading: () => <div className="h-48 flex items-center justify-center text-gray-400">Loading chart...</div> }
)

interface CragFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeStats: CragRouteStats
  gradeSystem: ReturnType<typeof import('@/features/grades/hooks/useGradeSystem').useGradeSystem>
  minGrade: string
  maxGrade: string
  onMinGradeChange: (value: string) => void
  onMaxGradeChange: (value: string) => void
  routeTypeChips: string[]
  selectedRouteTypes: string[]
  onToggleRouteType: (routeType: string) => void
  availableDirections: string[]
  selectedDirections: string[]
  onToggleDirection: (direction: string) => void
}

const CragFilterDialog = React.memo(function CragFilterDialog({
  open,
  onOpenChange,
  routeStats,
  gradeSystem,
  minGrade,
  maxGrade,
  onMinGradeChange,
  onMaxGradeChange,
  routeTypeChips,
  selectedRouteTypes,
  onToggleRouteType,
  availableDirections,
  selectedDirections,
  onToggleDirection,
}: CragFilterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
          <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
          <DialogTitle className="text-base">Filter climbs</DialogTitle>
          <div className="size-9" />
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 pb-24">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-900 dark:text-gray-100">Grade distribution</p>
              <span className="text-xs text-stone-500 dark:text-gray-400">Median {routeStats.medianGrade ? formatGradeForDisplay(routeStats.medianGrade, gradeSystem) : '—'}</span>
            </div>
            <div className="h-48 w-full">
              <GradeDistributionChart data={routeStats.gradeDistribution} gradeSystem={gradeSystem} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-stone-700 dark:text-gray-300">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Min grade</span>
              <select value={minGrade} onChange={(event) => onMinGradeChange(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                <option value="">Any</option>
                {PUBLIC_GRADES.map((grade) => <option key={`modal-min-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
              </select>
            </label>
            <label className="text-sm text-stone-700 dark:text-gray-300">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Max grade</span>
              <select value={maxGrade} onChange={(event) => onMaxGradeChange(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                <option value="">Any</option>
                {PUBLIC_GRADES.map((grade) => <option key={`modal-max-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climb type</p>
            <div className="flex flex-wrap gap-2">
              {routeTypeChips.map((routeType) => (
                <button key={routeType} type="button" onClick={() => onToggleRouteType(routeType)} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedRouteTypes.includes(routeType) ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                  {formatRouteTypeLabel(routeType)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Face direction</p>
            <div className="flex flex-wrap gap-2">
              {availableDirections.map((direction) => (
                <button key={direction} type="button" onClick={() => onToggleDirection(direction)} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedDirections.includes(direction) ? 'border-stone-900 bg-stone-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                  {direction}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 border-t border-stone-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <Button className="w-full" onClick={() => onOpenChange(false)}>Show results</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})

export default CragFilterDialog
