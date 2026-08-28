'use client'

import { useState, useTransition } from 'react'

import { setCragPublicationStatusAction } from '@/features/crags/actions/crag-governance-actions'
import { Button } from '@/components/ui/button'

type PublicationStatus = 'draft' | 'review' | 'published' | 'archived'

interface CragPublicationControlsProps {
  cragId: string
  initialNotes: string | null
  initialStatus: PublicationStatus
}

export default function CragPublicationControls({
  cragId,
  initialNotes,
  initialStatus,
}: CragPublicationControlsProps) {
  const [status, setStatus] = useState(initialStatus)
  const [notes, setNotes] = useState(initialNotes || '')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const updateStatus = (nextStatus: PublicationStatus) => {
    startTransition(async () => {
      setMessage('')
      const result = await setCragPublicationStatusAction({ cragId, status: nextStatus, notes })
      if (!result.success || !result.data) {
        setMessage(result.error || 'Unable to update publication status.')
        return
      }
      setStatus(result.data.status)
      setMessage(`Publication status changed to ${result.data.status}.`)
    })
  }

  return (
    <section aria-labelledby="publication-heading" className="mt-6 rounded-xl border bg-muted/30 p-4">
      <h2 className="font-semibold" id="publication-heading">Publication</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Current status: <strong className="text-foreground">{status}</strong>. Only published crags appear in public pages, search, maps, metrics, and sitemaps.
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor="publication-notes">Review note</label>
      <textarea
        className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="publication-notes"
        maxLength={1000}
        onChange={(event) => setNotes(event.target.value)}
        value={notes}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={isPending || status === 'review'} onClick={() => updateStatus('review')} type="button" variant="outline">Move to review</Button>
        <Button disabled={isPending || status === 'published'} onClick={() => updateStatus('published')} type="button">Publish</Button>
        <Button disabled={isPending || status === 'archived'} onClick={() => updateStatus('archived')} type="button" variant="destructive">Archive</Button>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>
    </section>
  )
}
