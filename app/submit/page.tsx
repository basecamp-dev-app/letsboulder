import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import DraftIntakeClient from '@/features/submissions/components/DraftIntakeClient'

export const dynamic = 'force-dynamic'

export default async function SubmitPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect_to=${encodeURIComponent('/submit')}`)
  }

  return <DraftIntakeClient />
}
