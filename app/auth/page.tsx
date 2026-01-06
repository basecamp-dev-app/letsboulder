'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [isDevMode, setIsDevMode] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const climbId = searchParams?.get('climbId')

  useEffect(() => {
    setOrigin(window.location.origin)
    // Check for dev mode: ?dev=true AND env flag is set
    if (searchParams?.get('dev') === 'true' && process.env.NEXT_PUBLIC_DEV_PASSWORD_AUTH === 'true') {
      setIsDevMode(true)
    }
  }, [searchParams])

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

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setError(error.message)
    } else {
      router.push(climbId ? `/map?climbId=${climbId}` : '/')
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
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="you@example.com"
                    required
                  />
                </div>

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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </button>
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
                Developer password login (env flag required)
              </p>

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="••••••••"
                    required
                  />
                </div>

                {error && (
                  <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

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
