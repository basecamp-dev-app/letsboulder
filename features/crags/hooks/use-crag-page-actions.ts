'use client'

import { useCallback, useState } from 'react'
import type { CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import { useCragAdminActions } from '@/features/crags/hooks/use-crag-admin-actions'
import { useCragOfflineActions } from '@/features/crags/hooks/use-crag-offline-actions'
import { useCragSwitcher } from '@/features/crags/hooks/use-crag-switcher'
import type { getCragOfflinePreview } from '@/lib/offline/packs'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export interface UseCragPageActionsParams {
  id: string
  initialCrag: CragPageCrag | null
}

export interface UseCragPageActionsResult {
  isAdmin: boolean
  isFlagging: boolean
  toast: string | null
  showToast: (message: string, durationMs?: number) => void
  cragSwitcherOpen: boolean
  setCragSwitcherOpen: (open: boolean) => void
  cragSwitcherQuery: string
  setCragSwitcherQuery: (query: string) => void
  cragSwitcherOptions: CragSwitcherOption[]
  offlineDialogOpen: boolean
  setOfflineDialogOpen: (open: boolean) => void
  offlineDialogLoading: boolean
  offlinePreviewLoading: boolean
  offlineError: string | null
  offlineProgress: OfflineJobProgressEvent | null
  offlinePreview: Awaited<ReturnType<typeof getCragOfflinePreview>> | null
  overOfflineBudget: boolean
  canSaveCragOffline: boolean
  handleFlagCrag: (cragId: string) => Promise<void>
  handleOpenOfflineDialog: () => Promise<void>
  handleSaveCragOffline: () => Promise<void>
  handleRemoveCragOffline: () => Promise<void>
  refreshCragOfflinePreview: () => Promise<void>
}

export function useCragPageActions({
  id,
  initialCrag,
}: UseCragPageActionsParams): UseCragPageActionsResult {
  const [toast, setToast] = useState<string | null>(null)
  const admin = useCragAdminActions({ initialCrag })
  const offline = useCragOfflineActions({ id })
  const switcher = useCragSwitcher({ initialCrag })

  const showToast = useCallback((message: string, durationMs = 3000) => {
    setToast(message)
    setTimeout(() => setToast(null), durationMs)
  }, [])

  const handleFlagCrag = useCallback(async (cragId: string) => {
    setToast(null)
    const message = await admin.handleFlagCrag(cragId)
    if (!message) return
    showToast(message)
  }, [admin, showToast])

  const handleOpenOfflineDialog = useCallback(async () => {
    offline.handleOpenOfflineDialog()
  }, [offline])

  const handleSaveCragOffline = useCallback(async () => {
    const message = await offline.handleSaveCragOffline()
    if (!message) return
    showToast(message)
  }, [offline, showToast])

  const handleRemoveCragOffline = useCallback(async () => {
    const message = await offline.handleRemoveCragOffline()
    if (!message) return
    showToast(message, 2500)
  }, [offline, showToast])

  return {
    isAdmin: admin.isAdmin,
    isFlagging: admin.isFlagging,
    toast,
    showToast,
    cragSwitcherOpen: switcher.cragSwitcherOpen,
    setCragSwitcherOpen: switcher.setCragSwitcherOpen,
    cragSwitcherQuery: switcher.cragSwitcherQuery,
    setCragSwitcherQuery: switcher.setCragSwitcherQuery,
    cragSwitcherOptions: switcher.cragSwitcherOptions,
    offlineDialogOpen: offline.offlineDialogOpen,
    setOfflineDialogOpen: offline.setOfflineDialogOpen,
    offlineDialogLoading: offline.offlineDialogLoading,
    offlinePreviewLoading: offline.offlinePreviewLoading,
    offlineError: offline.offlineError,
    offlineProgress: offline.offlineProgress,
    offlinePreview: offline.offlinePreview,
    overOfflineBudget: offline.overOfflineBudget,
    canSaveCragOffline: offline.canSaveCragOffline,
    handleFlagCrag,
    handleOpenOfflineDialog,
    handleSaveCragOffline,
    handleRemoveCragOffline,
    refreshCragOfflinePreview: offline.refreshCragOfflinePreview,
  }
}
