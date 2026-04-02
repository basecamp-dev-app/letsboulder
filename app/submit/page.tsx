import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import DraftIntakeClient from '@/app/submit/components/DraftIntakeClient'

export default async function SubmitPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect_to=${encodeURIComponent('/submit')}`)
  }

  return <DraftIntakeClient />
}
