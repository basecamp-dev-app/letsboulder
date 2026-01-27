'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { trackAuthLoginAttempted } from '@/lib/posthog'

interface AuthFormProps {}

export default function AuthForm(_props: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [showEmailSignIn, setShowEmailSignIn] = useState(false)
  const searchParams = useSearchParams()
  const climbId = searchParams?.get('climbId')
  const redirectTo = searchParams?.get('redirect_to')
  
  const emailValid = email.includes('@') && email.length > 3

  useEffect(() => {
     
    setOrigin(window.location.origin)
  }, [])

  const handleGoogleSignIn = async () => {
    setLoadingProvider('google')
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
      setLoadingProvider(null)
    }
  }

  const handleDiscordSignIn = async () => {
    setLoadingProvider('discord')
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: redirectTo 
          ? `${origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`
          : `${origin}/auth/callback`,
      },
    })
    trackAuthLoginAttempted('discord')
    if (error) {
      setError(error.message)
      setLoadingProvider(null)
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
            Welcome to gsyrocks
          </h1>
          
          {(climbId || redirectTo) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 text-center">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Sign in to log, verify, or vote
              </p>
            </div>
          )}

          <div className="space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={loadingProvider !== null}
                className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-lg font-semibold border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loadingProvider === 'google' ? 'Signing in...' : 'Continue with Google'}
              </button>

              <button
                onClick={handleDiscordSignIn}
                disabled={loadingProvider !== null}
                className="w-full bg-[#5865F2] dark:bg-[#5865F2] text-white py-3 px-6 rounded-lg font-semibold hover:bg-[#4752C4] dark:hover:bg-[#4752C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
                </svg>
                {loadingProvider === 'discord' ? 'Signing in...' : 'Continue with Discord'}
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
                Enter your email to receive a magic link. Click the link to sign in or create an account.
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
                ← Back to Google sign in/up
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
          </div>
        </div>
      </div>
    </div>
  )
}
