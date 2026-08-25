import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Mountain } from 'lucide-react'

import { listCragMetadataProposalsAction } from '@/features/crags/actions/crag-governance-actions'
import CragMetadataReviewList from '@/features/crags/components/CragMetadataReviewList'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface MaintainCragsPageProps {
  searchParams: Promise<{ proposalId?: string }>
}

export default async function MaintainCragsPage({ searchParams }: MaintainCragsPageProps) {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth?redirect_to=/maintain/crags')

  const params = await searchParams
  const [result, { data: assignments }] = await Promise.all([
    listCragMetadataProposalsAction(params.proposalId),
    supabase
      .from('crag_maintainers')
      .select('crag_id, crags!inner(id, name, region_name, sub_area)')
      .eq('user_id', user.id)
      .order('created_at'),
  ])

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">Crag stewardship</p>
        <h1 className="mt-2 text-3xl font-bold">Metadata review queue</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Compare community proposals with canonical crag metadata. Approval updates the crag and records a revision.
        </p>
      </header>

      {assignments && assignments.length > 0 ? (
        <section aria-labelledby="managed-crags-heading" className="mb-10">
          <h2 className="text-xl font-semibold" id="managed-crags-heading">Your managed crags</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {assignments.map((assignment) => {
              const crag = Array.isArray(assignment.crags) ? assignment.crags[0] : assignment.crags
              if (!crag) return null
              const location = [crag.sub_area, crag.region_name].filter(Boolean).join(', ') || 'Location not specified'
              return (
                <Link
                  className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition hover:border-blue-400/50 hover:bg-blue-500/5"
                  href={`/maintain/crags/${crag.id}`}
                  key={assignment.crag_id}
                >
                  <Mountain className="h-5 w-5 text-blue-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{crag.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{location}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {result.success ? (
        <CragMetadataReviewList
          key={(result.data || []).map((item) => `${item.proposal.id}:${item.proposal.status}:${item.canonical.name}`).join('|')}
          initialItems={result.data || []}
          selectedProposalId={params.proposalId}
        />
      ) : (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200" role="alert">
          {result.error || 'Unable to load proposals.'}
        </div>
      )}
    </main>
  )
}
