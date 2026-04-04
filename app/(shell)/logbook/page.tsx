import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerClient } from '@/lib/supabase-server'
import { fetchServerLogbookData } from '@/features/logbook/lib/queries-server'
import { type OwnLogbookData } from '@/features/logbook/lib/queries'
import { reportError } from '@/lib/errors'
import LogbookClient from './LogbookClient'

export default async function LogbookPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/logbook')
  }

  const headersList = await headers()
  const host = headersList.get('host')
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  const baseUrl = `${protocol}://${host}`

  let initialData: OwnLogbookData | undefined = undefined
  try {
    initialData = await fetchServerLogbookData(user, baseUrl)
  } catch (error) {
    reportError(error, { message: 'Failed to fetch logbook data server-side' })
  }

  return <LogbookClient user={user} initialData={initialData} />
}
