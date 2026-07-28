'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { AdminCrag } from '@/features/admin/crags/types'

interface DeleteCragDialogProps {
  crag: AdminCrag
  deleting: boolean
  onClose: () => void
  onConfirm: (confirmCount: string, reason: string) => void
}

export default function DeleteCragDialog({ crag, deleting, onClose, onConfirm }: DeleteCragDialogProps) {
  useOverlayHistory({ open: true, onClose, id: `admin-delete-crag-${crag.id}` })

  const [confirmCount, setConfirmCount] = useState('')
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <Trash2 className="w-6 h-6" />
          <h2 className="text-xl font-bold text-white">Delete Crag</h2>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <p className="text-white font-medium">{crag.name}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-400">
            <span>{crag.climb_count} climbs</span>
            <span>{crag.image_count} images</span>
          </div>
        </div>

        <p className="text-gray-300 mb-4">
          This hides the crag and its <span className="font-semibold text-white">{crag.climb_count} climbs</span> while preserving images, logs, and edit history.
        </p>

        <label className="mb-2 block text-white" htmlFor="crag-deletion-reason">Reason</label>
        <textarea
          id="crag-deletion-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Why is this crag being removed?"
          className="mb-4 min-h-20 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white placeholder-gray-500"
        />

        <p className="text-white mb-2">
          Type <span className="font-bold text-yellow-500">{crag.climb_count}</span> to confirm:
        </p>

        <input
          type="text"
          value={confirmCount}
          onChange={(event) => setConfirmCount(event.target.value)}
          placeholder="Type climb count..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(confirmCount, reason.trim())}
            disabled={confirmCount !== String(crag.climb_count) || !reason.trim() || deleting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
