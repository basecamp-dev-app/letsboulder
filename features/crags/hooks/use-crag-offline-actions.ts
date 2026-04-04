'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { reportError } from '@/lib/errors'
import { createClient } from '@/lib/supabase'
import { getOfflineCragState } from '@/features/crags/lib/crag-offline-domain'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'

interface UseCragOfflineActionsParams {
  id: string
}

export interface UseCragOfflineActionsResult {
  offlineDialogOpen: boolean
  setOfflineDialogOpen: (open: boolean) => void
  offlineDialogLoading: boolean
  offlinePreviewLoading: boolean
  offlineError: string | null
  offlineProgress: OfflineJobProgressEvent | null
  offlinePreview: Awaited<ReturnType<typeof getCragOfflinePreview>> | null
  overOfflineBudget: boolean
  canSaveCragOffline: boolean
  refreshCragOfflinePreview: () => Promise<void>
  handleOpenOfflineDialog: () => void
  handleSaveCragOffline: () => Promise<string | null>
  handleRemoveCragOffline: () => Promise<string | null>
}

export function useCragOfflineActions({ id }: UseCragOfflineActionsParams): UseCragOfflineActionsResult {
  const router = useRouter()
  const pathname = usePathname()

  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineDialogLoading, setOfflineDialogLoading] = useState(false)
  const [offlinePreviewLoading, setOfflinePreviewLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlinePreview, setOfflinePreview] = useState<Awaited<ReturnType<typeof getCragOfflinePreview>> | null>(null)
  const [offlineProgress, setOfflineProgress] = useState<OfflineJobProgressEvent | null>(null)

  const redirectToAuth = useCallback(() => {
    router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/crag/${id}`)}`)
  }, [id, pathname, router])

  const refreshCragOfflinePreview = useCallback(async () => {
    setOfflinePreviewLoading(true)
    try {
      const preview = await getCragOfflinePreview(id)
      setOfflinePreview(preview)
      setOfflineError(null)
    } catch (error) {
      reportError(error as Error, { message: 'Failed to load crag offline preview' })
      setOfflineError('Offline pack preview is unavailable right now.')
      setOfflinePreview(null)
    } finally {
      setOfflinePreviewLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  const handleOpenOfflineDialog = useCallback(() => {
    setOfflineDialogOpen(true)
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  const handleSaveCragOffline = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return null
    }

    setOfflineDialogLoading(true)
    setOfflineProgress(null)

    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false)
      }

      const result = await saveCragOffline(id, (event) => {
        setOfflineProgress(event)
      })
      await result.completed
      await refreshCragOfflinePreview()
      return result.warning || (offlinePreview?.existingPack ? 'Offline crag pack updated' : 'Crag saved for offline use')
    } catch (error) {
      reportError(error as Error, { message: 'Failed to save crag offline pack' })
      return error instanceof Error ? error.message : 'Failed to save crag offline pack'
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }, [id, offlinePreview?.existingPack, redirectToAuth, refreshCragOfflinePreview])

  const handleRemoveCragOffline = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return null
    }

    setOfflineDialogLoading(true)
    try {
      await removeCragOffline(id)
      await refreshCragOfflinePreview()
      setOfflineDialogOpen(false)
      return 'Offline crag pack removed'
    } catch (error) {
      reportError(error as Error, { message: 'Failed to remove crag pack' })
      return 'Failed to remove offline crag pack'
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }, [id, redirectToAuth, refreshCragOfflinePreview])

  const { overOfflineBudget, canSaveCragOffline } = getOfflineCragState(
    offlinePreview,
    offlineDialogLoading,
    offlinePreviewLoading
  )

  return {
    offlineDialogOpen,
    setOfflineDialogOpen,
    offlineDialogLoading,
    offlinePreviewLoading,
    offlineError,
    offlineProgress,
    offlinePreview,
    overOfflineBudget,
    canSaveCragOffline,
    refreshCragOfflinePreview,
    handleOpenOfflineDialog,
    handleSaveCragOffline,
    handleRemoveCragOffline,
  }
}
