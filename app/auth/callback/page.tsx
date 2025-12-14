'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = createClient()

      // Handle the auth callback
      const { data, error } = await supabase.auth.getSession()
      console.log('Callback: session data', data, 'error', error)

      if (error) {
        console.error('Auth callback error:', error)
        router.push('/auth/login?error=auth_callback_error')
        return
      }

      if (data.session) {
        console.log('Callback: has session, redirecting to map')
        router.push('/map')
      } else {
        console.log('Callback: no session, redirecting to login')
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