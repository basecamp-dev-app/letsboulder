import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { EditableRoute, FloorPlan, GymListItem } from '@/features/gym-admin/types'
import { fetchGymConfig, fetchGyms, mapToEditableRoute, saveRoutes } from '@/features/gym-admin/server'

interface UseGymAdminParams {
  onToast: (message: string) => void
}

interface UseGymAdminResult {
  gyms: GymListItem[]
  selectedGymId: string
  setSelectedGymId: (id: string) => void
  selectedGym: GymListItem | null
  loadingGyms: boolean
  loadingConfig: boolean
  savingRoutes: boolean
  error: string | null
  setError: (error: string | null) => void
  activeFloorPlan: FloorPlan | null
  routes: EditableRoute[]
  markerTargetId: string | null
  setMarkerTargetId: (id: string | null) => void
  handleCanvasClick: (event: MouseEvent<HTMLDivElement>) => void
  updateRoute: (routeId: string, patch: Partial<EditableRoute>) => void
  removeRoute: (routeId: string) => void
  handleSaveRoutes: () => Promise<void>
}

export function useGymAdminOrchestration({ onToast }: UseGymAdminParams): UseGymAdminResult {
  const [gyms, setGyms] = useState<GymListItem[]>([])
  const [selectedGymId, setSelectedGymId] = useState('')
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingRoutes, setSavingRoutes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFloorPlan, setActiveFloorPlan] = useState<FloorPlan | null>(null)
  const [routes, setRoutes] = useState<EditableRoute[]>([])
  const [markerTargetId, setMarkerTargetId] = useState<string | null>(null)

  const selectedGym = useMemo(
    () => gyms.find(gym => gym.id === selectedGymId) || null,
    [gyms, selectedGymId]
  )

  const loadGyms = useCallback(async () => {
    setLoadingGyms(true)
    setError(null)

    try {
      const items = await fetchGyms()
      setGyms(items)

      if (!selectedGymId && items.length > 0) {
        setSelectedGymId(items[0].id)
      }
    } catch {
      setError('Failed to load gyms')
    } finally {
      setLoadingGyms(false)
    }
  }, [selectedGymId])

  useEffect(() => {
    loadGyms().catch(() => {})
  }, [loadGyms])

  const loadGymConfig = useCallback(async (gymId: string) => {
    setLoadingConfig(true)
    setError(null)
    try {
      const payload = await fetchGymConfig(gymId)

      setActiveFloorPlan(payload.floor_plan)
      setRoutes((payload.routes || []).map(mapToEditableRoute))
    } catch {
      setError('Failed to load gym routes')
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedGymId) {
      setActiveFloorPlan(null)
      setRoutes([])
      return
    }

    loadGymConfig(selectedGymId).catch(() => {})
  }, [selectedGymId, loadGymConfig])

  const addRouteAtMarker = useCallback((xNorm: number, yNorm: number) => {
    if (!activeFloorPlan) return

    const id = `tmp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    setRoutes(current => [
      ...current,
      {
        id,
        persistedId: null,
        floor_plan_id: activeFloorPlan.id,
        name: '',
        grade: '',
        discipline: 'boulder',
        color: '',
        setter_name: '',
        status: 'active',
        marker: { x_norm: xNorm, y_norm: yNorm },
      },
    ])
  }, [activeFloorPlan])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!activeFloorPlan) return

    const rect = event.currentTarget.getBoundingClientRect()
    const xNorm = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const yNorm = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))

    if (markerTargetId) {
      setRoutes(current => current.map(route => route.id === markerTargetId
        ? { ...route, marker: { x_norm: xNorm, y_norm: yNorm } }
        : route))
      setMarkerTargetId(null)
      return
    }

    addRouteAtMarker(xNorm, yNorm)
  }, [activeFloorPlan, markerTargetId, addRouteAtMarker])

  const updateRoute = useCallback((routeId: string, patch: Partial<EditableRoute>) => {
    setRoutes(current => current.map(route => route.id === routeId ? { ...route, ...patch } : route))
  }, [])

  const removeRoute = useCallback((routeId: string) => {
    setRoutes(current => current.filter(route => route.id !== routeId))
  }, [])

  const handleSaveRoutes = useCallback(async () => {
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

      await saveRoutes(selectedGym.id, activeFloorPlan.id, payloadRoutes)

      onToast('Routes saved')
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save routes')
    } finally {
      setSavingRoutes(false)
    }
  }, [selectedGym, activeFloorPlan, routes, onToast, loadGymConfig, loadGyms])

  return {
    gyms,
    selectedGymId,
    setSelectedGymId,
    selectedGym,
    loadingGyms,
    loadingConfig,
    savingRoutes,
    error,
    setError,
    activeFloorPlan,
    routes,
    markerTargetId,
    setMarkerTargetId,
    handleCanvasClick,
    updateRoute,
    removeRoute,
    handleSaveRoutes,
  }
}
