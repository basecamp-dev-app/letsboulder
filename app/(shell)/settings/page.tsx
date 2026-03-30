import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import SettingsContent from './components/SettingsContent'

export default async function SettingsPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect=/settings')
  }

  return <SettingsContent user={user} />
}
