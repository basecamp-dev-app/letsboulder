import { redirect } from 'next/navigation'
import DraftIntakeView from '@/features/submissions/components/DraftIntakeView'
import { getServerClient } from '@/lib/supabase-server'

export default async function SubmitPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect_to=${encodeURIComponent('/submit')}`)
  }

  return <DraftIntakeView />
}
