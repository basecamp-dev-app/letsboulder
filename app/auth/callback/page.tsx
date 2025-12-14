'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Auth callback error:', error)
        router.push('/auth/register?error=auth_failed')
        return
      }

      if (data.session) {
        router.push('/map')
      } else {
        router.push('/auth/login?error=no_session')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Signing you in...</p>
      </div>
    </div>
  )
}