import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerClient } from '@/lib/supabase-server'
import { fetchServerLogbookData } from '@/features/logbook/lib/queries-server'
import { reportError } from '@/lib/errors'
import LogbookClient from './LogbookClient'

export default async function LogbookPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/logbook')
  }

  let initialData = undefined
  try {
    const headersList = await headers()
    const baseUrl = `${headersList.get('x-forwarded-proto') || 'https'}://${headersList.get('x-forwarded-host') || headersList.get('host')}`
    initialData = await fetchServerLogbookData(user, baseUrl)
  } catch (error) {
    reportError(error, { message: 'Failed to fetch logbook data server-side' })
  }

  return <LogbookClient user={user} initialData={initialData} />
}
