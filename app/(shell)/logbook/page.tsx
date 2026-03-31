import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import LogbookClient from './LogbookClient'

export default async function LogbookPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/logbook')
  }

  return <LogbookClient user={user} />
}
