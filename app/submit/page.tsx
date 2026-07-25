import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import DraftIntakeClient from '@/features/submissions/components/DraftIntakeClient'

export const dynamic = 'force-dynamic'

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ cragId?: string | string[] }>
}) {
  const { cragId: cragIdParam } = await searchParams
  const cragId = typeof cragIdParam === 'string' && cragIdParam.trim() ? cragIdParam.trim() : null
  const returnTo = cragId ? `/submit?${new URLSearchParams({ cragId }).toString()}` : '/submit'
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect_to=${encodeURIComponent(returnTo)}`)
  }

  return <DraftIntakeClient cragId={cragId} />
}
