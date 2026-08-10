'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-client'
import { createClient } from '@/lib/supabase'

interface InviteConfirmationProps {
  inviteType: 'submission' | 'draft'
  token: string
}

function hasAuthenticatedUser(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const data = (result as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return false
  const user = (data as Record<string, unknown>).user
  return !!user && typeof user === 'object'
}

export function InviteConfirmation({ inviteType, token }: InviteConfirmationProps) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmationPath = `/collaborate/${inviteType}/${encodeURIComponent(token)}`
  const claimPath = inviteType === 'submission'
    ? `/api/submissions/collaborate/${encodeURIComponent(token)}`
    : `/api/submissions/drafts/collaborate/${encodeURIComponent(token)}`

  useEffect(() => {
    void createClient().auth.getUser().then((result: unknown) => {
      setIsAuthenticated(hasAuthenticatedUser(result))
    })
  }, [])

  async function claimInvite() {
    if (!isAuthenticated) {
      router.push(`/auth?redirect_to=${encodeURIComponent(confirmationPath)}`)
      return
    }

    setClaiming(true)
    setError(null)
    try {
      const response = await csrfFetch(claimPath, { method: 'POST' })
      const payload = await response.json().catch(() => ({} as { error?: string; redirectTo?: string }))
      if (!response.ok || !payload.redirectTo) {
        setError(payload.error || 'Unable to accept this invitation.')
        return
      }

      router.replace(payload.redirectTo)
    } catch {
      setError('Unable to accept this invitation. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  const label = inviteType === 'submission' ? 'submission' : 'draft'

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <section className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-foreground">Collaborator invitation</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You have been invited to collaborate on a {label}. Accepting gives this account editing access.
        </p>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
        <Button className="mt-6 w-full rounded-xl" disabled={claiming || isAuthenticated === null} onClick={() => void claimInvite()}>
          {claiming ? 'Accepting invitation...' : isAuthenticated ? 'Accept invitation' : 'Sign in to accept'}
        </Button>
      </section>
    </main>
  )
}
