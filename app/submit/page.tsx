import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import SubmitClient from './SubmitClient'

export default async function SubmitPage() {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth?redirect_to=/submit')
  }

  return <SubmitClient />
}
