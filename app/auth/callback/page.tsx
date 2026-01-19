'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { trackAuthLoginSuccess } from '@/lib/posthog'

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Signing you in...</p>
        <p className="mt-2 text-sm text-gray-400">This may take a moment on mobile</p>
      </div>
    </div>
  )
}

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attemptCountRef = useRef(0)

  const validateRedirect = (path: string | null): string => {
    const allowedPaths = ['/', '/map', '/logbook', '/leaderboard', '/settings', '/submit', '/upload-climb', '/image/', '/climb/', '/crag/']

    if (!path) return '/map'

    if (/^(https?:)?\/\//i.test(path) || path.includes('..') || path.includes('//')) {
      return '/map'
    }

    const isAllowed = allowedPaths.some(allowed => path === allowed || path.startsWith(allowed + '/'))

    return isAllowed ? path : '/map'
  }

  useEffect(() => {
    const TIMEOUT_MS = 10000
    const RETRY_INTERVAL_MS = 500
    const MAX_RETRIES = 20
    const startTime = Date.now()

    const checkSession = async (): Promise<boolean> => {
      if (Date.now() - startTime > TIMEOUT_MS) {
        return false
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          return false
        }

        if (data.session) {
          return true
        }

        attemptCountRef.current += 1

        if (attemptCountRef.current < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
          return checkSession()
        }

        return false
      } catch (err) {
        attemptCountRef.current += 1
        if (attemptCountRef.current < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
          return checkSession()
        }
        return false
      }
    }

    const handleAuthCallback = async () => {
      setStatus('loading')
      setErrorMessage(null)

      const hasSession = await checkSession()

      if (hasSession) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', user.id)
            .single()

          if (!profile?.first_name) {
            router.push('/auth/set-name')
            return
          }
        }

        setStatus('success')
        trackAuthLoginSuccess('magic_link')
        const redirectTo = validateRedirect(searchParams.get('redirect_to'))
        router.push(redirectTo)
      } else {
        setStatus('error')
        const errorType = searchParams.get('error')
        if (errorType === 'access_denied') {
          setErrorMessage('The sign-in link has expired or has already been used.')
        } else {
          setErrorMessage('Unable to establish a session. Please try again or request a new magic link.')
        }
      }
    }

    const timer = setTimeout(() => {
      handleAuthCallback()
    }, 100)
    return () => clearTimeout(timer)
  }, [router, searchParams])

  const handleRetry = () => {
    attemptCountRef.current = 0
    setStatus('loading')
    setErrorMessage(null)

    const TIMEOUT_MS = 10000
    const RETRY_INTERVAL_MS = 500
    const MAX_RETRIES = 20
    const startTime = Date.now()

    const checkSession = async (): Promise<boolean> => {
      if (Date.now() - startTime > TIMEOUT_MS) {
        return false
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          return false
        }

        if (data.session) {
          return true
        }

        attemptCountRef.current += 1

        if (attemptCountRef.current < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
          return checkSession()
        }

        return false
      } catch (err) {
        attemptCountRef.current += 1
        if (attemptCountRef.current < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
          return checkSession()
        }
        return false
      }
    }

    const retryAuth = async () => {
      const hasSession = await checkSession()

      if (hasSession) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', user.id)
            .single()

          if (!profile?.first_name) {
            router.push('/auth/set-name')
            return
          }
        }

        setStatus('success')
        const redirectTo = validateRedirect(searchParams.get('redirect_to'))
        router.push(redirectTo)
      } else {
        setStatus('error')
        setErrorMessage('Unable to establish a session. Please try again or request a new magic link.')
      }
    }

    retryAuth()
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Signing you in...</p>
          <p className="mt-2 text-sm text-gray-400">This may take a moment on mobile</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sign-in Failed</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{errorMessage}</p>
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >
              Try Again
            </button>
            <a
              href="/auth"
              className="block w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  )
}
