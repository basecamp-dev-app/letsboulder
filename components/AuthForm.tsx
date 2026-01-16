'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [isDevMode, setIsDevMode] = useState(false)
  const [devLoading, setDevLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const climbId = searchParams?.get('climbId')
  
  const emailValid = email.includes('@') && email.length > 3

  useEffect(() => {
    setOrigin(window.location.origin)
    if (searchParams?.get('dev') === 'true' && process.env.NEXT_PUBLIC_DEV_PASSWORD_AUTH === 'true') {
      setIsDevMode(true)
    }
  }, [searchParams])

  const handleDevAutoLogin = async () => {
    setDevLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/dev-auth', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Dev authentication failed')
        setDevLoading(false)
        return
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate')
      setDevLoading(false)
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
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for a magic link!')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
            {isDevMode ? 'Developer Login' : 'Sign in to gsyrocks'}
          </h1>
          
          {climbId && !isDevMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-center">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Sign in to log this climb
              </p>
            </div>
          )}

          {!isDevMode ? (
            <>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-8">
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
                    autoFocus
                    disabled={loading}
                    className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
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

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Link href="/" className="text-gray-500 dark:text-gray-400 text-sm hover:underline block text-center">
                  ← Back to home
                </Link>
                <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                  By signing in, you agree to our{' '}
                  <Link href="/terms" className="underline">Terms</Link> and{' '}
                  <Link href="/privacy" className="underline">Privacy Policy</Link>
                </p>
                {process.env.NEXT_PUBLIC_DEV_PASSWORD_AUTH === 'true' && (
                  <p className="mt-2 text-xs text-center text-gray-400">
                    Developers: <Link href="/auth?dev=true" className="underline">password login</Link>
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400 text-center mb-8 text-sm">
                Developer auto-login (creates dev user if needed)
              </p>

              <button
                onClick={handleDevAutoLogin}
                disabled={devLoading}
                className="w-full bg-green-600 dark:bg-green-700 text-white dark:text-gray-100 py-4 px-6 rounded-lg font-semibold hover:bg-green-700 dark:hover:bg-green-600 transition-colors disabled:opacity-50 mb-4"
              >
                {devLoading ? 'Setting up dev user...' : 'Auto-Login as Dev User'}
              </button>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-6">
                Dev user authentication
              </p>

              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Link href="/auth" className="text-gray-500 dark:text-gray-400 text-sm hover:underline block text-center">
                  ← Back to magic link login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
