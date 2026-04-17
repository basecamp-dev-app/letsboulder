'use client'

import type React from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import { SITE_URL } from '@/lib/site'
import { clientEnv } from '@/lib/env-client'

function detectEmbeddedBrowser(userAgent: string): boolean {
  const normalizedUserAgent = userAgent.toLowerCase()

  return [
    'instagram',
    'fban',
    'fbav',
    'messenger',
    ' line/',
    'micromessenger',
    'wv',
  ].some((marker) => normalizedUserAgent.includes(marker))
}

export default function AuthForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const isEmbeddedBrowser = typeof window !== 'undefined' && detectEmbeddedBrowser(window.navigator.userAgent)

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${SITE_URL}/auth`)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  const searchParams = useSearchParams()
  const climbId = searchParams?.get('climbId')
  const redirectTo = searchParams?.get('redirect_to')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const emailValid = email.includes('@') && email.length > 3
  const socialButtonClassName =
    'h-12 w-full justify-center rounded-xl border font-semibold shadow-none'

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
          ? `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`
          : `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Check your email for a magic link. It will sign you in and bring you back here.')
    }
    setLoading(false)
  }

  if (isEmbeddedBrowser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-lg text-center">
            <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Please open letsboulder in your browser
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This app works best in Safari, Chrome, or Firefox.
            </p>
            <div className="mb-4 rounded-xl border border-border bg-muted/50 p-3 font-mono text-sm text-muted-foreground">
              letsboulder.com/auth
            </div>
            <Button
              onClick={handleCopyLink}
              className="w-full h-12 rounded-xl mb-6"
            >
              {copySuccess ? 'Copied!' : 'Copy Link'}
            </Button>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
            Welcome to letsboulder
          </h1>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            Sign in to save your sends, verify climbs, and keep your progress synced.
          </p>
          
          {(climbId || redirectTo) && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-center dark:border-blue-900/60 dark:bg-blue-950/20">
                <p className="text-sm text-blue-700 dark:text-blue-200">
                Sign in to log, verify, or vote
              </p>
            </div>
          )}

            <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-medium text-foreground">
              Signing in helps you:
            </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Build your logbook across sessions</li>
              <li>Verify climbs and vote on details</li>
              <li>Keep your profile and activity connected to your account</li>
            </ul>
          </div>

          

          {!isEmbeddedBrowser && (
            <div className="space-y-4">
              <Button
                onClick={handleGoogleSignIn}
                disabled={loadingProvider !== null}
                variant="outline"
                className={cn(
                  socialButtonClassName,
                  'border-border bg-background text-foreground hover:bg-muted/70'
                )}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {loadingProvider === 'google' ? 'Signing in...' : 'Continue with Google'}
              </Button>

              <Button
                onClick={handleDiscordSignIn}
                disabled={loadingProvider !== null}
                className={cn(
                  socialButtonClassName,
                  'border-0 bg-[#5865F2] text-white hover:bg-[#4752C4]'
                )}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
                </svg>
                {loadingProvider === 'discord' ? 'Signing in...' : 'Continue with Discord'}
              </Button>
            </div>
          )}

          {!isEmbeddedBrowser && <div className="flex items-center gap-4 my-6"><div className="flex-1 h-px bg-border"></div><span className="text-xs text-muted-foreground">or</span><div className="flex-1 h-px bg-border"></div></div>}

          <div className="space-y-4">
            <p className="mb-4 text-center text-sm text-muted-foreground">
              {isEmbeddedBrowser 
                ? 'Enter your email to receive a magic link. Click the link to sign in or create an account.'
                : 'No password needed: we will email you a magic link.'}
            </p>

            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  placeholder="you@example.com"
                  aria-invalid={!emailValid && email.length > 0}
                  className={cn(
                    'h-12 rounded-xl border-2 px-4 text-base md:text-base',
                    emailValid
                      ? 'border-green-500 focus-visible:border-green-600 focus-visible:ring-green-500/20 dark:border-green-500'
                      : 'border-border bg-background'
                  )}
                />
              </div>

              {emailValid && (
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl"
                >
                  {loading ? 'Sending...' : 'Email Me a Magic Link'}
                </Button>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
                  {success}
                </div>
              )}
            </form>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <p className="mb-4 text-xs text-muted-foreground">
              By signing up, you agree to the{' '}
              <Link href="/terms" className="underline hover:text-gray-900 dark:hover:text-gray-200">Terms of Service</Link>,{' '}
              <Link href="/privacy" className="underline hover:text-gray-900 dark:hover:text-gray-200">Privacy Policy</Link>, and{' '}
              <Link href="/cookies" className="underline hover:text-gray-900 dark:hover:text-gray-200">Cookie Use</Link>.
            </p>
            <Link href="/" className="block text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
