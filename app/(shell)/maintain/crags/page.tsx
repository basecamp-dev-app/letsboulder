import { redirect } from 'next/navigation'

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
  const result = await listCragMetadataProposalsAction(params.proposalId)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">Crag stewardship</p>
        <h1 className="mt-2 text-3xl font-bold">Metadata review queue</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Compare community proposals with canonical crag metadata. Approval updates the crag and records a revision.
        </p>
      </header>

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
