'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-gray-600 text-center mb-8">
            {isLogin ? 'Sign in to your account' : 'Join gsyrocks to contribute'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your name"
                  required={!isLogin}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {isLogin && (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading || !origin}
              className="w-full mt-3 text-blue-600 text-sm hover:underline disabled:opacity-50"
            >
              Sign in with magic link instead
            </button>
          )}

          <div className="mt-6 text-center">
            {isLogin ? (
              <p className="text-gray-600">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => {
                    setIsLogin(false)
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Register
                </button>
              </p>
            ) : (
              <p className="text-gray-600">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setIsLogin(true)
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Login
                </button>
              </p>
            )}
          </div>

          {isLogin && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <Link href="/" className="text-gray-500 text-sm hover:underline block text-center">
                ← Back to home
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
