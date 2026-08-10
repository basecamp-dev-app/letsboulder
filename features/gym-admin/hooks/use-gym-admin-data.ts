'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EditableRoute, FloorPlan, GymListItem } from '../types/gym-admin-types'
import { reportError } from '@/lib/errors'

interface UseGymAdminDataReturn {
  gyms: GymListItem[]
  selectedGymId: string
  setSelectedGymId: (id: string) => void
  selectedGym: GymListItem | null
  loadingGyms: boolean
  loadingConfig: boolean
  activeFloorPlan: FloorPlan | null
  routes: EditableRoute[]
  setRoutes: React.Dispatch<React.SetStateAction<EditableRoute[]>>
}

export function useGymAdminData(): UseGymAdminDataReturn {
  const [gyms, setGyms] = useState<GymListItem[]>([])
  const [selectedGymId, setSelectedGymId] = useState('')
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [activeFloorPlan, setActiveFloorPlan] = useState<FloorPlan | null>(null)
  const [routes, setRoutes] = useState<EditableRoute[]>([])

  const selectedGym = useMemo(
    () => gyms.find(gym => gym.id === selectedGymId) || null,
    [gyms, selectedGymId]
  )

  const loadGyms = useCallback(async () => {
    setLoadingGyms(true)
    try {
      const response = await fetch('/api/gym-admin/gyms')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        reportError(new Error('Failed to load gyms'), { message: 'Failed to load gyms', extra: payload.error })
        return
      }
      const payload = await response.json() as { gyms: GymListItem[] }
      const items = payload.gyms || []
      setGyms(items)
      if (items.length > 0) {
        setSelectedGymId(prev => prev || items[0].id)
      }
    } catch {
      reportError(new Error('Failed to load gyms'), { message: 'Failed to load gyms' })
    } finally {
      setLoadingGyms(false)
    }
  }, [])

  const loadGymConfig = useCallback(async (gymId: string) => {
    setLoadingConfig(true)
    try {
      const response = await fetch(`/api/gym-admin/gyms/${gymId}/starter-routes`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        reportError(new Error('Failed to load gym routes'), { message: 'Failed to load gym routes', extra: payload.error })
        return
      }
      const payload = await response.json() as {
        floor_plan: FloorPlan | null
        routes: Array<{
          id: string
          floor_plan_id: string
          name: string | null
          grade: string
          discipline: 'boulder' | 'sport' | 'top_rope' | 'mixed'
          color: string | null
          setter_name: string | null
          status: 'active' | 'retired'
          marker: { x_norm: number; y_norm: number } | null
        }>
      }
      setActiveFloorPlan(payload.floor_plan)
      setRoutes((payload.routes || []).map(route => ({
        id: route.id,
        persistedId: route.id,
        floor_plan_id: route.floor_plan_id,
        name: route.name || '',
        grade: route.grade || '',
        discipline: route.discipline,
        color: route.color || '',
        setter_name: route.setter_name || '',
        status: route.status || 'active',
        marker: route.marker,
      })))
    } catch {
      reportError(new Error('Failed to load gym routes'), { message: 'Failed to load gym routes' })
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  useEffect(() => {
    loadGyms().catch(() => {})
  }, [loadGyms])

  useEffect(() => {
    if (!selectedGymId) {
      setActiveFloorPlan(null)
      setRoutes([])
      return
    }
    loadGymConfig(selectedGymId).catch(() => {})
  }, [selectedGymId, loadGymConfig])

  return {
    gyms,
    selectedGymId,
    setSelectedGymId,
    selectedGym,
    loadingGyms,
    loadingConfig,
    activeFloorPlan,
    routes,
    setRoutes,
  }
}
