'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { trackAuthLoginAttempted } from '@/lib/posthog'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [showEmailSignIn, setShowEmailSignIn] = useState(false)
  const searchParams = useSearchParams()
  const climbId = searchParams?.get('climbId')
  const redirectTo = searchParams?.get('redirect_to')
  const isDevMode = searchParams?.get('dev') === 'true'
  
  const emailValid = email.includes('@') && email.length > 3

  useEffect(() => {
     
    setOrigin(window.location.origin)
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo 
          ? `${origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`
          : `${origin}/auth/callback`,
      },
    })
    trackAuthLoginAttempted('google')
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo 
          ? `${origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`
          : `${origin}/auth/callback`,
      },
    })

    trackAuthLoginAttempted('magic_link')

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for a magic link!')
    }
    setLoading(false)
  }

  const handleDevSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/dev-auth', {
        method: 'POST',
      })

      if (response.redirected) {
        window.location.href = response.url
        return
      }

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Dev authentication failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (isDevMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
            <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
              Developer Login
            </h1>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-6 text-sm">
              Sign in with dev credentials configured in environment variables
            </p>

            <form onSubmit={handleDevSignIn} className="space-y-4">
              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 dark:bg-green-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-green-700 dark:hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in as Developer'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Link href="/auth" className="text-gray-500 dark:text-gray-400 text-sm hover:underline block text-center">
                ← Back to regular sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
            Sign in to gsyrocks
          </h1>
          
          {(climbId || redirectTo) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-center">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Sign in to view this climb
              </p>
            </div>
          )}

          <div className="space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? 'Signing in...' : 'Continue with Google'}
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {!showEmailSignIn ? (
            <button
              onClick={() => setShowEmailSignIn(true)}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors text-sm"
            >
              Sign in with email instead
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400 text-center mb-4 text-sm">
                Enter your email to receive a magic link. Click the link in your email to sign in.
              </p>

              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    placeholder="you@example.com"
                    className={`w-full px-4 py-3 text-lg border-2 rounded-lg focus:outline-none transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                      emailValid 
                        ? 'border-green-500 dark:border-green-500 focus:border-green-600' 
                        : 'border-gray-300 dark:border-gray-600 focus:border-gray-500'
                    }`}
                  />
                </div>

                {emailValid && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Sending...' : 'Email Me a Magic Link'}
                  </button>
                )}

                {error && (
                  <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    {success}
                  </div>
                )}
              </form>

              <button
                onClick={() => setShowEmailSignIn(false)}
                className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-sm mt-4"
              >
                ← Back to Google sign in
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              By signing up, you agree to the{' '}
              <Link href="/terms" className="underline hover:text-gray-900 dark:hover:text-gray-200">Terms of Service</Link>,{' '}
              <Link href="/privacy" className="underline hover:text-gray-900 dark:hover:text-gray-200">Privacy Policy</Link>, and{' '}
              <Link href="/cookies" className="underline hover:text-gray-900 dark:hover:text-gray-200">Cookie Use</Link>.
            </p>
            <Link href="/" className="text-gray-500 dark:text-gray-400 text-sm hover:underline block text-center">
              ← Back to home
            </Link>
            {process.env.NEXT_PUBLIC_DEV_PASSWORD_AUTH === 'true' && (
              <p className="mt-2 text-xs text-center text-gray-400">
                Developers: <Link href="/auth?dev=true" className="underline">password login</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
