'use client'

import { useCallback } from 'react'

export function useInviteLinkCopy(
  addToast: (message: string, tone: 'success' | 'error') => void,
  setError: (message: string) => void,
) {
  return useCallback(async (inviteUrl: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      addToast('Invite link copied', 'success')
    } catch {
      setError('Failed to copy invite link')
      addToast('Failed to copy invite link', 'error')
    }
  }, [addToast, setError])
}
