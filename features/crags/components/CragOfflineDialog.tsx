'use client'

import { formatBytes } from '@/features/crags/lib/crag-page-domain'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface CragOfflineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  offlineDialogLoading: boolean
  offlinePreviewLoading: boolean
  offlinePreview: Awaited<ReturnType<typeof import('@/lib/offline/packs').getCragOfflinePreview>> | null
  offlineProgress: OfflineJobProgressEvent | null
  offlineError: string | null
  overOfflineBudget: boolean
  canSaveCragOffline: boolean
  onClose: () => void
  onRetry: () => void
  onRemove: () => void
  onSave: () => void
}

export default function CragOfflineDialog({
  open,
  onOpenChange,
  offlineDialogLoading,
  offlinePreviewLoading,
  offlinePreview,
  offlineProgress,
  offlineError,
  overOfflineBudget,
  canSaveCragOffline,
  onClose,
  onRetry,
  onRemove,
  onSave,
}: CragOfflineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
        <DialogHeader>
          <DialogTitle>{offlinePreview?.existingPack ? 'Update offline crag pack' : 'Download crag offline'}</DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Save this crag and its climb topos for offline viewing. Downloads include saved route pages, route assets, and images. Individually saved climbs stay pinned if you remove the crag pack later.
          </DialogDescription>
        </DialogHeader>

        {offlinePreviewLoading && !offlinePreview && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
            Preparing offline pack details...
          </div>
        )}

        {offlinePreview && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/70">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Climbs</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.manifest.climbCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Changed climbs</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.changedClimbs}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Total size</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.totalBytes)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Delta size</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.deltaBytes)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Storage used</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.usageBytes)} of {formatBytes(offlinePreview.budgetBytes)}</span>
              </div>
            </div>

            {offlinePreview.warning && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                {offlinePreview.warning}
              </p>
            )}

            {offlineProgress && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                <p className="font-medium">{offlineProgress.completedClimbs} / {offlineProgress.totalClimbs} climbs synced</p>
                <p className="mt-1 text-sm">{formatBytes(offlineProgress.completedBytes)} / {formatBytes(offlineProgress.totalBytes)} cached</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{offlineProgress.phase}{offlineProgress.currentClimbName ? ` · ${offlineProgress.currentClimbName}` : ''}</p>
              </div>
            )}

            {offlinePreview.isUpToDate && !offlineProgress && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                This crag pack is already up to date.
              </p>
            )}

            {overOfflineBudget && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                This update would exceed your 250 MB offline storage budget. Remove another pack first.
              </p>
            )}

            {offlineError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                {offlineError}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {offlinePreview?.existingPack && (
            <Button variant="ghost" onClick={onRemove} disabled={offlineDialogLoading} className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
              {offlineDialogLoading ? 'Removing...' : 'Remove offline pack'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={offlineDialogLoading}>Close</Button>
          {offlineError && !offlinePreview && (
            <Button variant="outline" onClick={onRetry} disabled={offlinePreviewLoading || offlineDialogLoading}>
              {offlinePreviewLoading ? 'Retrying...' : 'Retry'}
            </Button>
          )}
          <Button onClick={onSave} disabled={!canSaveCragOffline}>
            {offlineDialogLoading ? 'Syncing...' : offlinePreview?.existingPack ? 'Update offline pack' : 'Download crag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
