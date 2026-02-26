'use client'

import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from 'react'
import NextImage from 'next/image'
import { Loader2, Plus, Upload, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import AdminGymLocationPicker from '@/app/admin/gyms/components/AdminGymLocationPicker'

interface GymListItem {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  primary_discipline: string | null
  disciplines: string[]
  active_route_count: number
  active_floor_plan: {
    id: string
    name: string
    image_url: string
  } | null
}

interface FloorPlan {
  id: string
  gym_place_id: string
  name: string
  image_url: string
  image_width: number
  image_height: number
  is_active: boolean
}

interface EditableRoute {
  id: string
  persistedId: string | null
  floor_plan_id: string
  name: string
  grade: string
  discipline: 'boulder' | 'sport' | 'top_rope' | 'mixed'
  color: string
  setter_name: string
  status: 'active' | 'retired'
  marker: { x_norm: number; y_norm: number } | null
}

const DISCIPLINE_OPTIONS = [
  { value: 'boulder', label: 'Bouldering' },
  { value: 'sport', label: 'Sport' },
  { value: 'top_rope', label: 'Top rope' },
  { value: 'mixed', label: 'Mixed' },
] as const

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

function formatDiscipline(value: string): string {
  return value.replace('_', ' ')
}

export default function AdminGymsPage() {
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
  const [gymDisciplines, setGymDisciplines] = useState<string[]>(['boulder'])
  const [gymPrimaryDiscipline, setGymPrimaryDiscipline] = useState('boulder')
  const [creatingGym, setCreatingGym] = useState(false)

  const [floorPlanName, setFloorPlanName] = useState('Main floor')
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
      const response = await fetch('/api/admin/gyms')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to load gyms')
        return
      }

      const payload = await response.json() as { gyms: GymListItem[] }
      const items = payload.gyms || []
      setGyms(items)
      setSelectedGymId(current => current || items[0]?.id || '')
    } catch {
      setError('Failed to load gyms')
    } finally {
      setLoadingGyms(false)
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
  }, [selectedGymId])

  async function loadGymConfig(gymId: string) {
    setLoadingConfig(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/gyms/${gymId}/starter-routes`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to load gym configuration')
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
      setError('Failed to load gym configuration')
    } finally {
      setLoadingConfig(false)
    }
  }

  function toggleGymDiscipline(value: string) {
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
  }

  async function handleCreateGym() {
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
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to create gym')
        return
      }

      const created = await response.json() as GymListItem
      setToast(`Gym created: ${created.name}`)
      setTimeout(() => setToast(null), 3000)

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
  }

  async function handleFloorPlanUpload(event: ChangeEvent<HTMLInputElement>) {
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
        const payload = await saveResponse.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to save floor plan metadata')
        return
      }

      setToast('Active floor plan updated')
      setTimeout(() => setToast(null), 3000)
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch {
      setError('Failed to upload floor plan')
    } finally {
      event.target.value = ''
      setUploadingPlan(false)
    }
  }

  function addRouteAtMarker(xNorm: number, yNorm: number) {
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
  }

  function handleCanvasClick(event: MouseEvent<HTMLDivElement>) {
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
  }

  function updateRoute(routeId: string, patch: Partial<EditableRoute>) {
    setRoutes(current => current.map(route => route.id === routeId ? { ...route, ...patch } : route))
  }

  function removeRoute(routeId: string) {
    setRoutes(current => current.filter(route => route.id !== routeId))
  }

  async function saveStarterRoutes() {
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
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to save starter routes')
        return
      }

      setToast('Starter routes saved')
      setTimeout(() => setToast(null), 3000)
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch {
      setError('Failed to save starter routes')
    } finally {
      setSavingRoutes(false)
    }
  }

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <header>
        <h1 className="text-2xl font-bold text-white">Gyms</h1>
        <p className="mt-2 text-sm text-gray-400">Create gyms, upload one active floor plan, and set starter point markers.</p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">Create gym place</h2>
        <div className="mt-4 space-y-3">
          <input
            value={gymName}
            onChange={event => setGymName(event.target.value)}
            placeholder="Gym name"
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <div>
            <p className="mb-2 text-sm text-gray-300">Place gym pin</p>
            <AdminGymLocationPicker value={gymLocation} onChange={setGymLocation} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-gray-300">Disciplines</p>
            <div className="grid grid-cols-2 gap-2">
              {DISCIPLINE_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={gymDisciplines.includes(option.value)}
                    onChange={() => toggleGymDiscipline(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <label className="text-sm text-gray-300">
            Primary discipline
            <select
              value={gymPrimaryDiscipline}
              onChange={event => setGymPrimaryDiscipline(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              {gymDisciplines.map(discipline => (
                <option key={discipline} value={discipline}>{formatDiscipline(discipline)}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={handleCreateGym}
          disabled={creatingGym || !gymLocation || !gymName.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {creatingGym ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create gym
        </button>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Manage floor plan and starter routes</h2>
          {loadingGyms ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : null}
        </div>

        <div className="mt-4 max-w-sm">
          <label className="text-sm text-gray-300">
            Select gym
            <select
              value={selectedGymId}
              onChange={event => setSelectedGymId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              {gyms.map(gym => (
                <option key={gym.id} value={gym.id}>{gym.name}</option>
              ))}
            </select>
          </label>
        </div>

        {!selectedGym ? (
          <p className="mt-4 text-sm text-gray-400">Create your first gym to configure floor plans and routes.</p>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-white">{selectedGym.name}</span>
                {' '}
                • {selectedGym.country_code || 'N/A'} • {selectedGym.active_route_count} active starter routes
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedGym.latitude ?? 'N/A'}, {selectedGym.longitude ?? 'N/A'}
              </p>
            </div>

            <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4">
              <h3 className="text-sm font-semibold text-white">Active floor plan</h3>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <input
                  value={floorPlanName}
                  onChange={event => setFloorPlanName(event.target.value)}
                  placeholder="Floor plan name"
                  className="min-w-56 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                  {uploadingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload floor plan
                  <input type="file" accept="image/*" className="hidden" onChange={handleFloorPlanUpload} disabled={uploadingPlan} />
                </label>
              </div>
              {!activeFloorPlan ? (
                <p className="mt-3 text-xs text-yellow-300">Upload a floor plan to start placing routes.</p>
              ) : (
                <p className="mt-3 text-xs text-gray-400">
                  Active plan: {activeFloorPlan.name} ({activeFloorPlan.image_width}x{activeFloorPlan.image_height})
                </p>
              )}
            </div>

            {loadingConfig ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading gym configuration...
              </div>
            ) : activeFloorPlan ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
                <div>
                  <div className="mb-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>Click floor plan to add a route marker.</span>
                    {markerTargetId ? <span className="rounded bg-blue-900/40 px-2 py-1 text-blue-300">Click map to reposition selected marker</span> : null}
                  </div>
                  <div className="relative overflow-hidden rounded-lg border border-gray-800 bg-black">
                    <div className="relative" onClick={handleCanvasClick}>
                      <NextImage
                        src={activeFloorPlan.image_url}
                        alt={activeFloorPlan.name}
                        width={activeFloorPlan.image_width}
                        height={activeFloorPlan.image_height}
                        unoptimized
                        className="block w-full h-auto select-none"
                      />
                      {routes.map((route, index) => route.marker ? (
                        <button
                          key={route.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setMarkerTargetId(route.id)
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white shadow"
                          style={{
                            left: `${route.marker.x_norm * 100}%`,
                            top: `${route.marker.y_norm * 100}%`,
                          }}
                          title={`Route ${index + 1}`}
                        >
                          {route.grade || index + 1}
                        </button>
                      ) : null)}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Starter routes ({routes.length})</h4>
                    <button
                      type="button"
                      onClick={saveStarterRoutes}
                      disabled={savingRoutes}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                      {savingRoutes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>

                  <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
                    {routes.map((route, index) => (
                      <div key={route.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                          <span>Route {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeRoute(route.id)}
                            className="text-red-300 hover:text-red-200"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="space-y-2">
                          <input
                            value={route.name}
                            onChange={event => updateRoute(route.id, { name: event.target.value })}
                            placeholder="Name (optional)"
                            className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={route.grade}
                              onChange={event => updateRoute(route.id, { grade: event.target.value })}
                              placeholder="Grade"
                              className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                            />
                            <select
                              value={route.discipline}
                              onChange={event => updateRoute(route.id, { discipline: event.target.value as EditableRoute['discipline'] })}
                              className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white"
                            >
                              {DISCIPLINE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={route.color}
                              onChange={event => updateRoute(route.id, { color: event.target.value })}
                              placeholder="Color (optional)"
                              className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                            />
                            <input
                              value={route.setter_name}
                              onChange={event => updateRoute(route.id, { setter_name: event.target.value })}
                              placeholder="Setter (optional)"
                              className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white placeholder-gray-500"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setMarkerTargetId(route.id)}
                            className="text-xs text-blue-300 hover:text-blue-200"
                          >
                            {route.marker ? 'Reposition marker' : 'Set marker'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
