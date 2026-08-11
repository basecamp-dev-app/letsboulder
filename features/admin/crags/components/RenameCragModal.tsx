'use client'

import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AdminCrag } from '@/features/admin/crags/types'
import { proposeCragMetadataAction } from '@/features/crags/public-actions'

interface RenameCragModalProps {
  crag: AdminCrag
  onClose: () => void
  onSubmitted: (message: string) => void
}

export default function RenameCragModal({ crag, onClose, onSubmitted }: RenameCragModalProps) {
  const [name, setName] = useState(crag.name)
  const [regionTag, setRegionTag] = useState(crag.region_tag || '')
  const [subArea, setSubArea] = useState(crag.sub_area || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingMutation = useRef<{ payload: string; id: string } | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !regionTag.trim()) return

    const input = {
      cragId: crag.id,
      name,
      regionName: regionTag,
      subArea: subArea || null,
      reason,
    }
    const payload = JSON.stringify(input)
    if (!pendingMutation.current || pendingMutation.current.payload !== payload) {
      pendingMutation.current = { payload, id: crypto.randomUUID() }
    }

    setSaving(true)
    setError(null)
    let result
    try {
      result = await proposeCragMetadataAction({ ...input, clientMutationId: pendingMutation.current.id })
    } catch {
      setError('Failed to submit proposal. Try again to safely retry this request.')
      return
    } finally {
      setSaving(false)
    }
    if (!result.success) {
      setError(result.error || 'Failed to submit proposal')
      return
    }
    pendingMutation.current = null
    onSubmitted('Crag metadata proposal submitted for review')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="border-gray-800 bg-gray-900 text-white">
        <DialogHeader>
          <DialogTitle>Propose crag metadata</DialogTitle>
          <DialogDescription className="text-gray-400">Changes are reviewed before canonical crag metadata is updated.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="proposal-crag-name">Crag Name</label>
            <input
              id="proposal-crag-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="Enter crag name..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="proposal-region">Region Tag</label>
            <input
              id="proposal-region"
              type="text"
              value={regionTag}
              onChange={(e) => setRegionTag(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Yosemite Valley"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="proposal-sub-area">Sub-area (optional)</label>
            <input
              id="proposal-sub-area"
              type="text"
              value={subArea}
              onChange={(e) => setSubArea(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Valley S Side"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1" htmlFor="proposal-reason">Rationale</label>
            <textarea
              className="min-h-24 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              id="proposal-reason"
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this canonical metadata should change."
              value={reason}
            />
          </div>
          {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !regionTag.trim() || reason.trim().length < 10}
          >
            {saving ? <Loader2 className="animate-spin" /> : null} Submit proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
