'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        router.push('/logbook')
      } else {
        router.push('/auth')
      }
    }

    checkAuth()
  }, [router])

  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <p className="text-gray-600 dark:text-gray-400">Redirecting to your logbook...</p>
    </div>
  )
}
