import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import { fetchServerLogbookData } from '@/features/logbook/lib/queries-server'
import { reportError } from '@/lib/errors'
import LogbookClient from './LogbookClient'

export const dynamic = 'force-dynamic'

export default async function LogbookPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/logbook')
  }

  let initialData = undefined
  try {
    initialData = await fetchServerLogbookData(user)
  } catch (error) {
    reportError(error, { message: 'Failed to fetch logbook data server-side' })
  }

  return <LogbookClient user={user} initialData={initialData} />
}
