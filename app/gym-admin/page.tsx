'use client'

import { MouseEvent, useEffect, useMemo, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'

interface GymListItem {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  active_route_count: number
  membership_role: string | null
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

export default function GymAdminPage() {
  const [gyms, setGyms] = useState<GymListItem[]>([])
  const [selectedGymId, setSelectedGymId] = useState('')
  const [loadingGyms, setLoadingGyms] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingRoutes, setSavingRoutes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activeFloorPlan, setActiveFloorPlan] = useState<FloorPlan | null>(null)
  const [routes, setRoutes] = useState<EditableRoute[]>([])
  const [markerTargetId, setMarkerTargetId] = useState<string | null>(null)

  const selectedGym = useMemo(
    () => gyms.find(gym => gym.id === selectedGymId) || null,
    [gyms, selectedGymId]
  )

  useEffect(() => {
    loadGyms().catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedGymId) {
      setActiveFloorPlan(null)
      setRoutes([])
      return
    }

    loadGymConfig(selectedGymId).catch(() => {})
  }, [selectedGymId])

  async function loadGyms() {
    setLoadingGyms(true)
    setError(null)

    try {
      const response = await fetch('/api/gym-admin/gyms')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to load gyms')
        return
      }

      const payload = await response.json() as { gyms: GymListItem[] }
      const items = payload.gyms || []
      setGyms(items)

      if (!selectedGymId && items.length > 0) {
        setSelectedGymId(items[0].id)
      }
    } catch {
      setError('Failed to load gyms')
    } finally {
      setLoadingGyms(false)
    }
  }

  async function loadGymConfig(gymId: string) {
    setLoadingConfig(true)
    setError(null)
    try {
      const response = await fetch(`/api/gym-admin/gyms/${gymId}/starter-routes`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to load gym routes')
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
      setError('Failed to load gym routes')
    } finally {
      setLoadingConfig(false)
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

  async function saveRoutes() {
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
      await loadGymConfig(selectedGym.id)
      await loadGyms()
    } catch {
      setError('Failed to save routes')
    } finally {
      setSavingRoutes(false)
    }
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <header>
        <h1 className="text-2xl font-bold text-white">Your gym routes</h1>
        <p className="mt-2 text-sm text-gray-400">Manage route markers and grades for your gyms. Floor plans are managed by letsboulder admins.</p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {loadingGyms ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading gyms...
        </div>
      ) : gyms.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-sm text-gray-300">
          You do not have gym access yet. Ask an internal admin to add you to your gym team.
        </div>
      ) : (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="max-w-sm">
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

          {selectedGym ? (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-white">{selectedGym.name}</span>
                {' '}
                • role: <span className="capitalize">{selectedGym.membership_role || 'member'}</span>
                {' '}
                • {selectedGym.active_route_count} active routes
              </p>
              {!selectedGym.active_floor_plan ? (
                <p className="mt-2 text-xs text-yellow-300">No active floor plan yet. Ask an admin to upload one for this gym.</p>
              ) : null}
            </div>
          ) : null}

          {loadingConfig ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading route editor...
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
                    <img src={activeFloorPlan.image_url} alt={activeFloorPlan.name} className="block w-full select-none" />
                    {routes.map((route, index) => route.marker ? (
                      <button
                        key={route.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setMarkerTargetId(route.id)
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white shadow"
                        style={{ left: `${route.marker.x_norm * 100}%`, top: `${route.marker.y_norm * 100}%` }}
                      >
                        {route.grade || index + 1}
                      </button>
                    ) : null)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Routes ({routes.length})</h4>
                  <button
                    type="button"
                    onClick={saveRoutes}
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
                        <button type="button" onClick={() => removeRoute(route.id)} className="text-red-300 hover:text-red-200">
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
                        <button type="button" onClick={() => setMarkerTargetId(route.id)} className="text-xs text-blue-300 hover:text-blue-200">
                          {route.marker ? 'Reposition marker' : 'Set marker'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}
