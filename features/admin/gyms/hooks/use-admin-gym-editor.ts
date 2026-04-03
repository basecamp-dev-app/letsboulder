'use client'

import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import type { EditableRoute, FloorPlan, GymDiscipline, GymListItem } from '@/features/admin/gyms/types'

function getResponseError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error
    }
  }

  return fallback
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => reject(new Error('Invalid image file'))
    image.src = dataUrl
  })
}

export function useAdminGymEditor() {
  const [gyms, setGyms] = useState<GymListItem[]>([])
  const [selectedGymId, setSelectedGymId] = useState<string>('')
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingRoutes, setSavingRoutes] = useState(false)
  const [uploadingPlan, setUploadingPlan] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [gymName, setGymName] = useState('')
  const [gymLocation, setGymLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [gymDisciplines, setGymDisciplines] = useState<GymDiscipline[]>(['boulder'])
  const [gymPrimaryDiscipline, setGymPrimaryDiscipline] = useState<GymDiscipline>('boulder')
  const [creatingGym, setCreatingGym] = useState(false)

  const [floorPlanName, setFloorPlanName] = useState('Main floor')
  const [activeFloorPlan, setActiveFloorPlan] = useState<FloorPlan | null>(null)
  const [routes, setRoutes] = useState<EditableRoute[]>([])
  const [markerTargetId, setMarkerTargetId] = useState<string | null>(null)

  const selectedGym = useMemo(
    () => gyms.find(gym => gym.id === selectedGymId) || null,
    [gyms, selectedGymId]
  )

  const showToast = useCallback((message: string, duration = 3000) => {
    setToast(message)
    setTimeout(() => setToast(null), duration)
  }, [])

  const loadGyms = useCallback(async () => {
    setLoadingGyms(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/gyms')
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        setError(getResponseError(payload, 'Failed to load gyms'))
        return
      }

      const payload = await response.json() as { gyms?: GymListItem[] }
      const items = payload.gyms || []
      setGyms(items)
      setSelectedGymId(current => current || items[0]?.id || '')
    } catch {
      setError('Failed to load gyms')
    } finally {
      setLoadingGyms(false)
    }
  }, [])

  const loadGymConfig = useCallback(async (gymId: string) => {
    setLoadingConfig(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/gyms/${gymId}/starter-routes`)
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        setError(getResponseError(payload, 'Failed to load gym configuration'))
        return
      }

      const payload = await response.json() as {
        floor_plan: FloorPlan | null
        routes?: Array<{
          id: string
          floor_plan_id: string
          name: string | null
          grade: string
          discipline: GymDiscipline
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
      setError('Failed to load gym configuration')
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  useEffect(() => {
    void loadGyms()
  }, [loadGyms])

  useEffect(() => {
    if (!selectedGymId) {
      setActiveFloorPlan(null)
      setRoutes([])
      return
    }

    void loadGymConfig(selectedGymId)
  }, [loadGymConfig, selectedGymId])

  const toggleGymDiscipline = useCallback((value: GymDiscipline) => {
    setGymDisciplines(current => {
      if (current.includes(value)) {
        const next = current.filter(item => item !== value)
        if (next.length === 0) return current
        if (!next.includes(gymPrimaryDiscipline)) {
          setGymPrimaryDiscipline(next[0])
        }
        return next
      }

      return [...current, value]
    })
  }, [gymPrimaryDiscipline])

  const handleCreateGym = useCallback(async () => {
    setCreatingGym(true)
    setError(null)

    try {
      if (!gymLocation) {
        setError('Place a pin on the map before creating the gym')
        return
      }

      const response = await csrfFetch('/api/admin/gyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: gymName,
          latitude: gymLocation.latitude,
          longitude: gymLocation.longitude,
          disciplines: gymDisciplines,
          primary_discipline: gymPrimaryDiscipline,
        }),
      })

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        setError(getResponseError(payload, 'Failed to create gym'))
        return
      }

      const created = await response.json() as GymListItem
      showToast(`Gym created: ${created.name}`)

      setGymName('')
      setGymLocation(null)
      setGymDisciplines(['boulder'])
      setGymPrimaryDiscipline('boulder')

      await loadGyms()
      setSelectedGymId(created.id)
    } catch {
      setError('Failed to create gym')
    } finally {
      setCreatingGym(false)
    }
  }, [gymDisciplines, gymLocation, gymName, gymPrimaryDiscipline, loadGyms, showToast])

  const handleFloorPlanUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedGym || !event.target.files || event.target.files.length === 0) return

    const file = event.target.files[0]
    setUploadingPlan(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        setError('Authentication required')
        return
      }

      const imageInfo = await getImageDimensions(file)
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${authData.user.id}/${selectedGym.id}/${Date.now()}-${safeFileName}`

      const { error: uploadError } = await supabase
        .storage
        .from('gym-floor-plans')
        .upload(storagePath, file, { upsert: false })

      if (uploadError) {
        setError(uploadError.message || 'Failed to upload floor plan image')
        return
      }

      const { data: publicUrlData } = supabase.storage.from('gym-floor-plans').getPublicUrl(storagePath)
      const imageUrl = publicUrlData.publicUrl

      const saveResponse = await csrfFetch(`/api/admin/gyms/${selectedGym.id}/floor-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: floorPlanName.trim() || 'Main floor',
          image_url: imageUrl,
          image_width: imageInfo.width,
          image_height: imageInfo.height,
        }),
      })

      if (!saveResponse.ok) {
        const payload: unknown = await saveResponse.json().catch(() => null)
        setError(getResponseError(payload, 'Failed to save floor plan metadata'))
        return
      }

      showToast('Active floor plan updated')
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch {
      setError('Failed to upload floor plan')
    } finally {
      event.target.value = ''
      setUploadingPlan(false)
    }
  }, [floorPlanName, loadGymConfig, loadGyms, selectedGym, showToast])

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
  }, [activeFloorPlan, addRouteAtMarker, markerTargetId])

  const updateRoute = useCallback((routeId: string, patch: Partial<EditableRoute>) => {
    setRoutes(current => current.map(route => route.id === routeId ? { ...route, ...patch } : route))
  }, [])

  const removeRoute = useCallback((routeId: string) => {
    setRoutes(current => current.filter(route => route.id !== routeId))
  }, [])

  const saveStarterRoutes = useCallback(async () => {
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
        setError('Every starter route needs a grade and marker')
        return
      }

      const response = await csrfFetch(`/api/admin/gyms/${selectedGym.id}/starter-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: payloadRoutes }),
      })

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        setError(getResponseError(payload, 'Failed to save starter routes'))
        return
      }

      showToast('Starter routes saved')
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch {
      setError('Failed to save starter routes')
    } finally {
      setSavingRoutes(false)
    }
  }, [activeFloorPlan, loadGymConfig, loadGyms, routes, selectedGym, showToast])

  return {
    activeFloorPlan,
    addRouteAtMarker,
    creatingGym,
    error,
    floorPlanName,
    gymDisciplines,
    gymLocation,
    gymName,
    gymPrimaryDiscipline,
    gyms,
    handleCanvasClick,
    handleCreateGym,
    handleFloorPlanUpload,
    loadGyms,
    loadingConfig,
    loadingGyms,
    markerTargetId,
    removeRoute,
    routes,
    saveStarterRoutes,
    savingRoutes,
    selectedGym,
    selectedGymId,
    setFloorPlanName,
    setGymLocation,
    setGymName,
    setMarkerTargetId,
    setSelectedGymId,
    setGymPrimaryDiscipline,
    showToast,
    toast,
    toggleGymDiscipline,
    updateRoute,
    uploadingPlan,
  }
}
