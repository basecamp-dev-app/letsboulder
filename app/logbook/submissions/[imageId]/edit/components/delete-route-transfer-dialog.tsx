'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface DeleteTransferCandidate {
  routeLineId: string
  climbName: string
  grade: string | null
}

interface DeleteRouteTransferDialogProps {
  open: boolean
  sourceRouteName: string
  candidates: DeleteTransferCandidate[]
  selectedTargetRouteLineId: string
  onSelectedTargetChange: (routeLineId: string) => void
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteRouteTransferDialog({
  open,
  sourceRouteName,
  candidates,
  selectedTargetRouteLineId,
  onSelectedTargetChange,
  deleting,
  onConfirm,
  onCancel,
}: DeleteRouteTransferDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) return
        onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose route to inherit logs</DialogTitle>
          <DialogDescription>
            Multiple routes named {sourceRouteName ? `"${sourceRouteName}"` : 'the same'} were found on this image. Pick one target before deleting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Transfer logs to
            <select
              value={selectedTargetRouteLineId}
              onChange={(event) => onSelectedTargetChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {candidates.map((candidate) => (
                <option key={candidate.routeLineId} value={candidate.routeLineId}>
                  {candidate.climbName}{candidate.grade ? ` (${candidate.grade})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Transfer and delete'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
