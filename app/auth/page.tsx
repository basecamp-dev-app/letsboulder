'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [showResetRequest, setShowResetRequest] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const router = useRouter()

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        router.push('/')
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
        },
      })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Check your email for a confirmation link!')
      }
    }
    setLoading(false)
  }

  const handleMagicLink = async () => {
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

  const handlePasswordResetRequest = async () => {
    if (!email) {
      setError('Please enter your email address')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for a password reset link!')
    }
    setLoading(false)
  }

  if (showResetRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
            <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
              Reset Password
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-8">
              Enter your email to receive a password reset link
            </p>

            <div className="space-y-4">
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
                type="button"
                onClick={handlePasswordResetRequest}
                disabled={loading}
                className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait...' : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowResetRequest(false)
                  setError(null)
                  setSuccess(null)
                }}
                className="w-full text-gray-600 dark:text-gray-400 text-sm hover:underline"
              >
                ← Back to login
              </button>
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
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-8">
            {isLogin ? 'Sign in to your account' : 'Join gsyrocks to contribute'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Your name"
                  required={!isLogin}
                />
              </div>
            )}

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
                minLength={6}
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
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {isLogin && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading || !origin}
              className="w-full mt-3 text-gray-600 dark:text-gray-400 text-sm hover:underline disabled:opacity-50"
            >
              Sign in with magic link instead
            </button>
          )}

          {isLogin && (
            <button
              type="button"
              onClick={() => {
                setShowResetRequest(true)
                setError(null)
                setSuccess(null)
              }}
              className="w-full mt-3 text-gray-600 dark:text-gray-400 text-sm hover:underline"
            >
              Forgot password?
            </button>
          )}

          <div className="mt-6 text-center">
            {isLogin ? (
              <p className="text-gray-600 dark:text-gray-400">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => {
                    setIsLogin(false)
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-gray-800 dark:text-gray-200 hover:underline font-medium"
                >
                  Register
                </button>
              </p>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setIsLogin(true)
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-gray-800 dark:text-gray-200 hover:underline font-medium"
                >
                  Login
                </button>
              </p>
            )}
          </div>

          {isLogin && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Link href="/" className="text-gray-500 dark:text-gray-400 text-sm hover:underline block text-center">
                ← Back to home
              </Link>
              <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                By logging in, you agree to our{' '}
                <Link href="/terms" className="underline">Terms</Link> and{' '}
                <Link href="/privacy" className="underline">Privacy Policy</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
