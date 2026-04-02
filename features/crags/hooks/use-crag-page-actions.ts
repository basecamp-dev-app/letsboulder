'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import type { CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import { getOfflineCragState } from '@/features/crags/lib/crag-offline-domain'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export interface UseCragPageActionsParams {
  id: string
  crag: CragPageCrag | null
  initialCrag: CragPageCrag | null
}

export interface UseCragPageActionsResult {
  isAdmin: boolean
  isFlagging: boolean
  toast: string | null
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
  crag,
  initialCrag,
}: UseCragPageActionsParams): UseCragPageActionsResult {
  const router = useRouter()
  const pathname = usePathname()

  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [cragSwitcherOpen, setCragSwitcherOpen] = useState(false)
  const [cragSwitcherQuery, setCragSwitcherQuery] = useState('')
  const [cragSwitcherOptions, setCragSwitcherOptions] = useState<CragSwitcherOption[]>([])
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineDialogLoading, setOfflineDialogLoading] = useState(false)
  const [offlinePreviewLoading, setOfflinePreviewLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlinePreview, setOfflinePreview] = useState<Awaited<ReturnType<typeof getCragOfflinePreview>> | null>(null)
  const [offlineProgress, setOfflineProgress] = useState<OfflineJobProgressEvent | null>(null)

  const refreshCragOfflinePreview = useCallback(async () => {
    setOfflinePreviewLoading(true)
    try {
      const preview = await getCragOfflinePreview(id)
      setOfflinePreview(preview)
      setOfflineError(null)
    } catch (error) {
      console.error('Failed to load crag offline preview:', error)
      setOfflineError('Offline pack preview is unavailable right now.')
      setOfflinePreview(null)
    } finally {
      setOfflinePreviewLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  useEffect(() => {
    let ignore = false

    async function loadCragSwitcherOptions() {
      if (!initialCrag) return
      const sourceCrag = initialCrag
      const fallbackOption: CragSwitcherOption = {
        id: sourceCrag.id,
        name: sourceCrag.name,
        regionName: sourceCrag.region_name || sourceCrag.climbing_areas?.name || null,
        subArea: sourceCrag.sub_area || null,
        countryCode: sourceCrag.country_code || null,
      }

      if (cragSwitcherQuery.trim().length >= 2) {
        try {
          const response = await fetch(`/api/crags/search?q=${encodeURIComponent(cragSwitcherQuery.trim())}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (typeof sourceCrag.latitude === 'number' && typeof sourceCrag.longitude === 'number') {
        try {
          const response = await fetch(`/api/crags/nearby?lat=${sourceCrag.latitude}&lng=${sourceCrag.longitude}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (!ignore) {
        setCragSwitcherOptions([fallbackOption])
      }
    }

    void loadCragSwitcherOptions()

    return () => {
      ignore = true
    }
  }, [cragSwitcherQuery, initialCrag])

  useEffect(() => {
    let ignore = false

    async function loadAdminStatus() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || ignore) return

      if (user.app_metadata?.gsyrocks_admin === true) {
        setIsAdmin(true)
        return
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (ignore) return
        setIsAdmin(profile?.is_admin === true)
      } catch {
        if (ignore) return
        setIsAdmin(false)
      }
    }

    void loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [])

  const handleFlagCrag = useCallback(async (cragId: string) => {
    if (isFlagging) return
    setIsFlagging(true)
    setToast(null)

    try {
      const response = await csrfFetch(`/api/crags/${cragId}/flag`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setToast(data.error || 'Failed to flag crag')
        return
      }

      setToast('Crag flagged for review')
      setTimeout(() => setToast(null), 3000)
    } catch {
      setToast('Failed to flag crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setIsFlagging(false)
    }
  }, [isFlagging])

  const redirectToAuth = useCallback(() => {
    router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/crag/${id}`)}`)
  }, [id, pathname, router])

  const handleOpenOfflineDialog = useCallback(async () => {
    setOfflineDialogOpen(true)
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  const handleSaveCragOffline = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return
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
      setToast(result.warning || (offlinePreview?.existingPack ? 'Offline crag pack updated' : 'Crag saved for offline use'))
      setTimeout(() => setToast(null), 3000)
    } catch (error) {
      console.error('Failed to save crag offline pack:', error)
      setToast(error instanceof Error ? error.message : 'Failed to save crag offline pack')
      setTimeout(() => setToast(null), 3000)
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
      return
    }

    setOfflineDialogLoading(true)
    try {
      await removeCragOffline(id)
      await refreshCragOfflinePreview()
      setOfflineDialogOpen(false)
      setToast('Offline crag pack removed')
      setTimeout(() => setToast(null), 2500)
    } catch (error) {
      console.error('Failed to remove crag pack:', error)
      setToast('Failed to remove offline crag pack')
      setTimeout(() => setToast(null), 2500)
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
    isAdmin,
    isFlagging,
    toast,
    cragSwitcherOpen,
    setCragSwitcherOpen,
    cragSwitcherQuery,
    setCragSwitcherQuery,
    cragSwitcherOptions,
    offlineDialogOpen,
    setOfflineDialogOpen,
    offlineDialogLoading,
    offlinePreviewLoading,
    offlineError,
    offlineProgress,
    offlinePreview,
    overOfflineBudget,
    canSaveCragOffline,
    handleFlagCrag,
    handleOpenOfflineDialog,
    handleSaveCragOffline,
    handleRemoveCragOffline,
    refreshCragOfflinePreview,
  }
}
