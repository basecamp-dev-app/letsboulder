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
import { proposeCragMetadataAction } from '@/features/crags/actions/crag-governance-actions'
import { useOpenDataConsent } from '@/features/legal/public-client'

interface CragMetadataProposalDialogProps {
  cragId: string
  sourceImageId?: string
  currentName: string
  currentRegionName: string
  currentSubArea: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}

export function CragMetadataProposalDialog({
  cragId,
  sourceImageId,
  currentName,
  currentRegionName,
  currentSubArea,
  open,
  onOpenChange,
  onSubmitted,
}: CragMetadataProposalDialogProps) {
  const { requireConsent } = useOpenDataConsent()
  const [name, setName] = useState(currentName)
  const [regionName, setRegionName] = useState(currentRegionName)
  const [subArea, setSubArea] = useState(currentSubArea)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingMutation = useRef<{ payload: string; id: string } | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return
    if (nextOpen) {
      setName(currentName)
      setRegionName(currentRegionName)
      setSubArea(currentSubArea)
      setReason('')
      setError(null)
      pendingMutation.current = null
    }
    onOpenChange(nextOpen)
  }

  const submitProposal = async () => {
    const input = {
      cragId,
      name: name.trim(),
      regionName: regionName.trim(),
      subArea: subArea.trim() || null,
      reason: reason.trim(),
      sourceImageId: sourceImageId || null,
    }
    const payload = JSON.stringify(input)
    if (!pendingMutation.current || pendingMutation.current.payload !== payload) {
      pendingMutation.current = { payload, id: crypto.randomUUID() }
    }

    setSubmitting(true)
    setError(null)
    let result
    try {
      result = await proposeCragMetadataAction({
        ...input,
        clientMutationId: pendingMutation.current.id,
      })
    } catch {
      setError('Failed to submit proposal. Try again to safely retry this request.')
      return
    } finally {
      setSubmitting(false)
    }
    if (!result.success) {
      setError(result.error || 'Failed to submit crag metadata proposal')
      return
    }

    pendingMutation.current = null
    onOpenChange(false)
    onSubmitted()
  }

  const submit = () => {
    void requireConsent(submitProposal)
  }

  const changed = name.trim() !== currentName.trim()
    || regionName.trim() !== currentRegionName.trim()
    || subArea.trim() !== currentSubArea.trim()
  const canSubmit = changed && name.trim().length > 0 && regionName.trim().length > 0 && reason.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose crag details revision</DialogTitle>
          <DialogDescription>
            These details are shared by every submission at this crag. A different crag maintainer or moderator must approve the revision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="proposed-crag-name">
            Crag name
            <input id="proposed-crag-name" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label className="block text-sm font-medium" htmlFor="proposed-region-name">
            Region tag
            <input id="proposed-region-name" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" maxLength={100} onChange={(event) => setRegionName(event.target.value)} value={regionName} />
          </label>
          <label className="block text-sm font-medium" htmlFor="proposed-sub-area">
            Sub-area (optional)
            <input id="proposed-sub-area" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" maxLength={120} onChange={(event) => setSubArea(event.target.value)} value={subArea} />
          </label>
          <label className="block text-sm font-medium" htmlFor="proposal-reason">
            Rationale
            <textarea
              id="proposal-reason"
              className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2"
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain how you verified the correct details."
              value={reason}
            />
          </label>
          {error ? <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={() => handleOpenChange(false)} variant="outline">Cancel</Button>
          <Button disabled={submitting || !canSubmit} onClick={() => { void submit() }}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Submit for review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
