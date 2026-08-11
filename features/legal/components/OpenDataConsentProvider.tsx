'use client'

import Link from 'next/link'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useLazyAuthUser } from '@/components/use-lazy-auth-user'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  acceptOpenDataConsentAction,
  getOpenDataConsentStatusAction,
} from '@/features/legal/actions/open-data-consent'
import { OpenDataConsentContext } from '@/features/legal/hooks/use-open-data-consent'
import type { ContributionIntent } from '@/features/legal/types/open-data-consent'

export function OpenDataConsentProvider({ children }: { children: ReactNode }) {
  const { user, load: loadAuthUser, getAuthRevision } = useLazyAuthUser()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requiredVersion, setRequiredVersion] = useState<string | null>(null)
  const pendingIntent = useRef<ContributionIntent | null>(null)
  const currentUserId = useRef<string | null>(null)

  const resetConsentState = useEffectEvent(() => {
    pendingIntent.current = null
    setRequiredVersion(null)
    setError(null)
    setOpen(false)
    setSubmitting(false)
  })

  useEffect(() => {
    void loadAuthUser()
  }, [loadAuthUser])

  useEffect(() => {
    const nextUserId = user?.id ?? null
    if (currentUserId.current === nextUserId) return

    currentUserId.current = nextUserId
    resetConsentState()
  }, [user?.id])

  async function requireConsent(intent: ContributionIntent) {
    const requestAuthRevision = getAuthRevision()
    const status = await getOpenDataConsentStatusAction()
    if (requestAuthRevision !== getAuthRevision()) return

    if (status.success && status.data?.isValid) {
      setRequiredVersion(status.data.requiredVersion)
      await intent()
      return
    }

    if (status.success && status.data) setRequiredVersion(status.data.requiredVersion)
    pendingIntent.current = intent
    setError(status.success ? null : (status.error || 'Could not check contribution terms'))
    setOpen(true)
  }

  async function acceptAndContinue() {
    setSubmitting(true)
    setError(null)
    if (!requiredVersion) {
      setSubmitting(false)
      setError('Could not identify the current contribution terms')
      return
    }
    const requestAuthRevision = getAuthRevision()
    const result = await acceptOpenDataConsentAction(requiredVersion)
    if (requestAuthRevision !== getAuthRevision()) return

    setSubmitting(false)

    if (!result.success || !result.data?.isValid) {
      setError(result.error || 'Could not record your agreement')
      const status = await getOpenDataConsentStatusAction()
      if (requestAuthRevision !== getAuthRevision()) return
      if (status.success && status.data) setRequiredVersion(status.data.requiredVersion)
      return
    }

    const intent = pendingIntent.current
    pendingIntent.current = null
    setOpen(false)
    if (intent) await intent()
  }

  return (
    <OpenDataConsentContext.Provider value={{ requireConsent }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting) return
          setOpen(nextOpen)
          if (!nextOpen) pendingIntent.current = null
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keep climbing knowledge open</DialogTitle>
            <DialogDescription className="leading-relaxed">
              LetsBoulder is an open climbing wiki. Photos and text you contribute are shared under CC BY-SA 4.0. Structured climbing data and route geometry are shared under ODbL 1.0.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            By agreeing, you confirm you have the right to contribute this material. This applies to future contributions under this terms version.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Read the <Link href="/open-data-terms" target="_blank" className="font-medium underline underline-offset-2">Open Data Contributor Terms</Link>{requiredVersion ? ` (${requiredVersion})` : ''}.
          </p>
          {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Not now</Button>
            <Button type="button" disabled={submitting} onClick={() => { void acceptAndContinue() }}>
              {submitting ? 'Saving...' : 'Agree and continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OpenDataConsentContext.Provider>
  )
}
