'use client'

import { useCallback, useState } from 'react'
import type { CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import { useCragAdminActions } from '@/features/crags/hooks/use-crag-admin-actions'
import { useCragSwitcher } from '@/features/crags/hooks/use-crag-switcher'
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
  handleFlagCrag: (cragId: string) => Promise<void>
}

export function useCragPageActions({
  id,
  initialCrag,
}: UseCragPageActionsParams): UseCragPageActionsResult {
  const [toast, setToast] = useState<string | null>(null)
  const admin = useCragAdminActions({ initialCrag })
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
    handleFlagCrag,
  }
}
