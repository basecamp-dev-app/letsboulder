'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface OfflinePackSummary {
  mediaCount?: number
  estimatedBytes?: number
}

interface ClimbOfflineDialogProps {
  open: boolean
  isOfflineSaved: boolean
  offlineActionLoading: boolean
  offlineSaveWouldExceedBudget: boolean
  climbName: string
  offlinePack: OfflinePackSummary | null
  offlineUsageBytes: number
  offlineBudgetBytes: number
  formatBytes: (bytes: number) => string
  onOpenChange: (open: boolean) => void
  onConfirmSave: () => void
  onRemove: () => void
}

export default function ClimbOfflineDialog({ open, isOfflineSaved, offlineActionLoading, offlineSaveWouldExceedBudget, climbName, offlinePack, offlineUsageBytes, offlineBudgetBytes, formatBytes, onOpenChange, onConfirmSave, onRemove }: ClimbOfflineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
        <DialogHeader>
          <DialogTitle>{isOfflineSaved ? 'Offline pack saved' : 'Save climb offline'}</DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {isOfflineSaved
              ? 'This climb pack stores topo photos and core climb data on this device.'
              : 'This saves topo photos and core climb data for offline viewing.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/60">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500 dark:text-gray-400">Climb</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{climbName || 'This climb'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-gray-500 dark:text-gray-400">Photos</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePack?.mediaCount || 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-gray-500 dark:text-gray-400">Estimated size</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePack?.estimatedBytes || 0)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-gray-500 dark:text-gray-400">Storage used</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlineUsageBytes)} of {formatBytes(offlineBudgetBytes)}</span>
            </div>
          </div>

          {offlineSaveWouldExceedBudget && !isOfflineSaved ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              This pack exceeds your offline storage budget. Remove another saved climb first.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {isOfflineSaved ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={offlineActionLoading}>
                Close
              </Button>
              <Button variant="ghost" onClick={onRemove} disabled={offlineActionLoading} className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                {offlineActionLoading ? 'Removing...' : 'Remove offline pack'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={offlineActionLoading}>
                Cancel
              </Button>
              <Button onClick={onConfirmSave} disabled={offlineActionLoading || !offlinePack || offlineSaveWouldExceedBudget}>
                {offlineActionLoading ? 'Saving...' : 'Save offline'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
