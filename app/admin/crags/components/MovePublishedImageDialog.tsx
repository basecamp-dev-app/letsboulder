'use client'

import { Loader2, ArrowRightLeft } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { AdminCrag, CragImageRouteCandidate, MoveImageState } from '@/app/admin/crags/types'

interface MovePublishedImageDialogProps {
  movingImage: MoveImageState
  moveCandidates: CragImageRouteCandidate[]
  loadingMoveCandidates: boolean
  selectedMoveCandidate: CragImageRouteCandidate | null
  selectedTargetCragId: string
  targetCragOptions: AdminCrag[]
  movingPublishedImage: boolean
  onClose: () => void
  onMove: () => void
  onSelectTargetCragId: (value: string) => void
  onSelectImageId: (value: string) => void
}

export default function MovePublishedImageDialog({
  loadingMoveCandidates,
  moveCandidates,
  movingImage,
  movingPublishedImage,
  onClose,
  onMove,
  onSelectImageId,
  onSelectTargetCragId,
  selectedMoveCandidate,
  selectedTargetCragId,
  targetCragOptions,
}: MovePublishedImageDialogProps) {
  useOverlayHistory({ open: true, onClose, id: 'admin-move-published-image' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center gap-3 text-blue-400 mb-4">
          <ArrowRightLeft className="w-6 h-6" />
          <h2 className="text-xl font-bold text-white">Move Published Route Image</h2>
        </div>

        <p className="text-sm text-gray-300 mb-4">
          Move one published route image and its linked climbs from <span className="font-semibold text-white">{movingImage.sourceCrag.name}</span> to another crag.
        </p>

        {loadingMoveCandidates ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading published route images...
          </div>
        ) : moveCandidates.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-400">
            No published route images with routes were found for this crag.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">Published route image</label>
              <select
                value={movingImage.imageId}
                onChange={(event) => onSelectImageId(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
              >
                {moveCandidates.map((candidate, index) => (
                  <option key={candidate.imageId} value={candidate.imageId}>
                    {`Image ${index + 1} • ${candidate.climbCount} routes`}
                  </option>
                ))}
              </select>
            </div>

            {selectedMoveCandidate ? (
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex gap-4">
                  <div className="h-28 w-28 overflow-hidden rounded-lg bg-gray-800 shrink-0">
                    {selectedMoveCandidate.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedMoveCandidate.imageUrl} alt="Published route preview" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p><span className="font-medium text-white">Routes:</span> {selectedMoveCandidate.climbCount}</p>
                    <p><span className="font-medium text-white">Names:</span> {selectedMoveCandidate.climbNames.join(', ')}</p>
                    <p><span className="font-medium text-white">Image ID:</span> <span className="text-gray-400">{selectedMoveCandidate.imageId}</span></p>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">Target crag</label>
              <select
                value={selectedTargetCragId}
                onChange={(event) => onSelectTargetCragId(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
              >
                <option value="">Select target crag</option>
                {targetCragOptions.map((crag) => (
                  <option key={crag.id} value={crag.id}>
                    {crag.name}{crag.region_tag ? ` • ${crag.region_tag}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onMove}
            disabled={loadingMoveCandidates || moveCandidates.length === 0 || !movingImage.imageId || !selectedTargetCragId || movingPublishedImage}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {movingPublishedImage ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Move image and routes'}
          </button>
        </div>
      </div>
    </div>
  )
}
