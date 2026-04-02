'use client'

import { useCallback, useEffect, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import type { AdminCrag } from '@/app/admin/crags/types'

function getResponseError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error
    }
  }

  return fallback
}

export function useAdminCrags() {
  const [crags, setCrags] = useState<AdminCrag[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const showToast = useCallback((message: string, duration = 3000) => {
    setToast(message)
    setTimeout(() => setToast(null), duration)
  }, [])

  const loadCrags = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/crags?admin=true')
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        showToast(getResponseError(payload, 'Failed to load crags'))
        return
      }

      const data = await response.json() as { crags?: AdminCrag[] }
      setCrags(data.crags || [])
    } catch {
      showToast('Failed to load crags')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void loadCrags()
  }, [loadCrags])

  const renameCrag = useCallback(async (cragId: string, data: { name: string; rock_type: string | null; region_tag: string; sub_area: string | null }) => {
    try {
      const response = await csrfFetch(`/api/crags/${cragId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        showToast('Crag renamed successfully')
        void loadCrags()
        return
      }

      const errorData: unknown = await response.json().catch(() => null)
      showToast(getResponseError(errorData, 'Failed to rename crag'))
    } catch {
      showToast('Failed to rename crag')
    }
  }, [loadCrags, showToast])

  const deleteCrag = useCallback(async (crag: AdminCrag, confirmCount: string) => {
    if (confirmCount !== String(crag.climb_count)) {
      showToast('Type the climb count exactly to confirm')
      return
    }

    setDeleting(true)
    try {
      const response = await csrfFetch(`/api/crags/${crag.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        showToast(`Crag "${crag.name}" deleted`)
        void loadCrags()
        return
      }

      const errorData: unknown = await response.json().catch(() => null)
      showToast(getResponseError(errorData, 'Failed to delete crag'))
    } catch {
      showToast('Failed to delete crag')
    } finally {
      setDeleting(false)
    }
  }, [loadCrags, showToast])

  return {
    crags,
    deleting,
    loadCrags,
    loading,
    renameCrag,
    deleteCrag,
    showToast,
    toast,
  }
}
