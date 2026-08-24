'use client'

import { useCallback, useState } from 'react'
import type { CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import { useCragSwitcher } from '@/features/crags/hooks/use-crag-switcher'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export interface UseCragPageActionsParams {
  initialCrag: CragPageCrag | null
}

export interface UseCragPageActionsResult {
  toast: string | null
  showToast: (message: string, durationMs?: number) => void
  cragSwitcherOpen: boolean
  setCragSwitcherOpen: (open: boolean) => void
  cragSwitcherQuery: string
  setCragSwitcherQuery: (query: string) => void
  cragSwitcherOptions: CragSwitcherOption[]
}

export function useCragPageActions({
  initialCrag,
}: UseCragPageActionsParams): UseCragPageActionsResult {
  const [toast, setToast] = useState<string | null>(null)
  const switcher = useCragSwitcher({ initialCrag })

  const showToast = useCallback((message: string, durationMs = 3000) => {
    setToast(message)
    setTimeout(() => setToast(null), durationMs)
  }, [])

  return {
    toast,
    showToast,
    cragSwitcherOpen: switcher.cragSwitcherOpen,
    setCragSwitcherOpen: switcher.setCragSwitcherOpen,
    cragSwitcherQuery: switcher.cragSwitcherQuery,
    setCragSwitcherQuery: switcher.setCragSwitcherQuery,
    cragSwitcherOptions: switcher.cragSwitcherOptions,
  }
}
