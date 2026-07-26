'use client'

import { useCallback, useEffect, useState } from 'react'
import { submitCragFlagAction } from '@/features/moderation/public'
import { createClient } from '@/lib/supabase'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

interface UseCragAdminActionsParams {
  initialCrag: CragPageCrag | null
}

export interface UseCragAdminActionsResult {
  isAdmin: boolean
  isFlagging: boolean
  handleFlagCrag: (cragId: string) => Promise<string | null>
}

export function useCragAdminActions({ initialCrag }: UseCragAdminActionsParams): UseCragAdminActionsResult {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadAdminStatus() {
      if (!initialCrag) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || ignore) return

      if (user.app_metadata?.gsyrocks_admin === true) {
        setIsAdmin(true)
        return
      }

      try {
        const { data: isAdmin } = await isCurrentUserAdmin(supabase)

        if (ignore) return
        setIsAdmin(isAdmin === true)
      } catch {
        if (ignore) return
        setIsAdmin(false)
      }
    }

    void loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [initialCrag])

  const handleFlagCrag = useCallback(async (cragId: string) => {
    if (isFlagging) return null
    setIsFlagging(true)

    try {
      const result = await submitCragFlagAction(cragId)
      if (!result.success) {
        return result.error || 'Failed to flag crag'
      }

      return 'Crag flagged for review'
    } catch {
      return 'Failed to flag crag'
    } finally {
      setIsFlagging(false)
    }
  }, [isFlagging])

  return {
    isAdmin,
    isFlagging,
    handleFlagCrag,
  }
}
