import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getServerClient } from '@/lib/supabase-server'

const DraftIntakeView = dynamic(
  () => import('@/features/submissions/components/DraftIntakeView'),
  { ssr: false, loading: () => <div className="min-h-screen bg-gray-50 dark:bg-gray-900" /> }
)

export default async function SubmitPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect_to=${encodeURIComponent('/submit')}`)
  }

  return <DraftIntakeView />
}
