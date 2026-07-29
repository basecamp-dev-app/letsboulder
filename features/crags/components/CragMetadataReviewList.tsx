'use client'

import { startTransition, useState } from 'react'
import { Check, ExternalLink, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { reviewCragMetadataProposalAction } from '@/features/crags/actions/crag-governance-actions'
import type { CragMetadataReviewItem } from '@/features/crags/actions/crag-governance-types'
import { Button } from '@/components/ui/button'

interface CragMetadataReviewListProps {
  initialItems: CragMetadataReviewItem[]
  selectedProposalId?: string
}

function MetadataDiff({ label, canonical, proposed }: { label: string; canonical: string | null; proposed: string | null }) {
  const changed = (canonical || '') !== (proposed || '')

  return (
    <div className={`grid gap-1 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_1fr] ${changed ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div>
        <p className="text-xs text-muted-foreground">Canonical</p>
        <p className={changed ? 'text-red-300 line-through decoration-red-400/60' : ''}>{canonical || 'None'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Proposed</p>
        <p className={changed ? 'font-medium text-emerald-300' : ''}>{proposed || 'None'}</p>
      </div>
    </div>
  )
}

export default function CragMetadataReviewList({ initialItems, selectedProposalId }: CragMetadataReviewListProps) {
  const [items, setItems] = useState(initialItems)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const review = (proposalId: string, decision: 'approve' | 'reject') => {
    setPendingId(proposalId)
    setMessage(null)
    startTransition(async () => {
      const result = await reviewCragMetadataProposalAction({
        proposalId,
        decision,
        reviewNote: notes[proposalId]?.trim() || null,
      })
      setPendingId(null)
      if (!result.success) {
        setMessage(result.error || 'Review failed')
        return
      }
      setItems((current) => current.filter((item) => item.proposal.id !== proposalId))
      setMessage(result.data?.status === 'conflict'
        ? 'The proposal conflicted with a newer crag revision and was not applied.'
        : `Proposal ${result.data?.status || 'reviewed'}.`)
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Review queue is clear</h2>
        <p className="mt-2 text-sm text-muted-foreground">RLS only shows proposals for crags you maintain.</p>
        {message ? <p className="mt-4 text-sm text-emerald-400" role="status">{message}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {message ? <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm" role="status">{message}</p> : null}
      {items.map((item) => {
        const isPending = pendingId === item.proposal.id
        const isSelected = selectedProposalId === item.proposal.id
        return (
          <article
            className={`rounded-2xl border bg-card p-5 shadow-sm ${isSelected ? 'border-blue-400 ring-2 ring-blue-400/20' : 'border-border'}`}
            id={`proposal-${item.proposal.id}`}
            key={item.proposal.id}
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{item.proposal.status} metadata proposal</p>
                <h2 className="mt-1 text-xl font-semibold">{item.canonical.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Proposed by {item.proposerName || 'a community member'} on {item.proposal.created_at.slice(0, 10)}
                </p>
              </div>
              <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{item.proposal.id}</code>
            </div>

            <div className="space-y-2">
              <MetadataDiff label="Name" canonical={item.canonical.name} proposed={item.proposal.proposed_name} />
              <MetadataDiff label="Region" canonical={item.canonical.regionName} proposed={item.proposal.proposed_region_name} />
              <MetadataDiff label="Sub-area" canonical={item.canonical.subArea} proposed={item.proposal.proposed_sub_area} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="rounded-xl bg-muted/50 p-4">
                <h3 className="text-sm font-semibold">Rationale</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.proposal.reason}</p>
              </section>
              <section className="rounded-xl bg-muted/50 p-4">
                <h3 className="text-sm font-semibold">Source context</h3>
                {item.sourceImage ? (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p>Related image from {item.sourceImage.createdAt?.slice(0, 10) || 'an unknown date'}</p>
                    <a className="inline-flex items-center gap-1 text-blue-400 hover:underline" href={item.sourceImage.url} rel="noreferrer" target="_blank">
                      Open source image <ExternalLink className="size-3.5" />
                    </a>
                    <p className="break-all text-xs">Image ID: {item.sourceImage.id}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No source image was attached.</p>
                )}
              </section>
            </div>

            {item.reviewable ? <div className="mt-5">
              <label className="text-sm font-medium" htmlFor={`review-note-${item.proposal.id}`}>Review note (optional)</label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isPending}
                id={`review-note-${item.proposal.id}`}
                maxLength={1000}
                onChange={(event) => setNotes((current) => ({ ...current, [item.proposal.id]: event.target.value }))}
                placeholder="Explain the decision or flag anything the proposer should revisit."
                value={notes[item.proposal.id] || ''}
              />
            </div> : null}

            {item.proposal.review_note ? <p className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm"><strong>Review note:</strong> {item.proposal.review_note}</p> : null}
            {item.reviewable ? <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button disabled={isPending} onClick={() => review(item.proposal.id, 'reject')} variant="destructive">
                {isPending ? <Loader2 className="animate-spin" /> : <X />} Reject
              </Button>
              <Button disabled={isPending} onClick={() => review(item.proposal.id, 'approve')}>
                {isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
            </div> : <p className="mt-4 text-sm text-muted-foreground">This proposal is available for status review only.</p>}
          </article>
        )
      })}
    </div>
  )
}
