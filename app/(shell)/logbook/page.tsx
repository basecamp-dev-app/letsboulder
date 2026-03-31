import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import { fetchServerLogbookData } from '@/features/logbook/lib/queries-server'
import { type OwnLogbookData } from '@/features/logbook/lib/queries'
import LogbookClient from './LogbookClient'

export default async function LogbookPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/logbook')
  }

  let initialData: OwnLogbookData | undefined = undefined
  try {
    initialData = await fetchServerLogbookData(user)
  } catch (error) {
    console.error('Failed to fetch logbook data server-side:', error)
  }

  return <LogbookClient user={user} initialData={initialData} />
}
