'use client'

import { useCallback, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import type { EditableRoute, FloorPlan, GymListItem } from '../types'

interface UseGymAdminActionsParams {
  selectedGym: GymListItem | null
  activeFloorPlan: FloorPlan | null
  routes: EditableRoute[]
  onReload: () => Promise<void>
}

interface UseGymAdminActionsReturn {
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  toast: string | null
  savingRoutes: boolean
  saveRoutes: () => Promise<void>
}

export function useGymAdminActions({
  selectedGym,
  activeFloorPlan,
  routes,
  onReload,
}: UseGymAdminActionsParams): UseGymAdminActionsReturn {
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [savingRoutes, setSavingRoutes] = useState(false)

  const saveRoutes = useCallback(async () => {
    if (!selectedGym || !activeFloorPlan) return

    setSavingRoutes(true)
    setError(null)

    try {
      const payloadRoutes = routes.map(route => ({
        id: route.persistedId || undefined,
        floor_plan_id: activeFloorPlan.id,
        name: route.name.trim() || null,
        grade: route.grade.trim(),
        discipline: route.discipline,
        color: route.color.trim() || null,
        setter_name: route.setter_name.trim() || null,
        status: route.status,
        marker: route.marker,
      }))

      const invalid = payloadRoutes.find(route => !route.grade || !route.marker)
      if (invalid) {
        setError('Every route needs a grade and marker')
        return
      }

      const response = await csrfFetch(`/api/gym-admin/gyms/${selectedGym.id}/starter-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: payloadRoutes }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to save routes')
        return
      }

      setToast('Routes saved')
      setTimeout(() => setToast(null), 3000)
      await onReload()
    } catch {
      setError('Failed to save routes')
    } finally {
      setSavingRoutes(false)
    }
  }, [selectedGym, activeFloorPlan, routes, onReload])

  return {
    error,
    setError,
    toast,
    savingRoutes,
    saveRoutes,
  }
}
