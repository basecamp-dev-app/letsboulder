import { csrfFetch } from '@/hooks/useCsrf'
import type { GymConfigPayload, GymListItem } from '@/features/gym-admin/types'

export async function fetchGyms(): Promise<GymListItem[]> {
  const response = await fetch('/api/gym-admin/gyms')
  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load gyms')
  }

  const payload = await response.json() as { gyms: GymListItem[] }
  return payload.gyms || []
}

export async function fetchGymConfig(gymId: string): Promise<GymConfigPayload> {
  const response = await fetch(`/api/gym-admin/gyms/${gymId}/starter-routes`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load gym routes')
  }

  return response.json() as Promise<GymConfigPayload>
}

export interface SaveRoutesPayload {
  routes: Array<{
    id: string | undefined
    floor_plan_id: string
    name: string | null
    grade: string
    discipline: string
    color: string | null
    setter_name: string | null
    status: string
    marker: { x_norm: number; y_norm: number } | null
  }>
}

export async function saveRoutes(gymId: string, floorPlanId: string, routes: SaveRoutesPayload['routes']): Promise<void> {
  const response = await csrfFetch(`/api/gym-admin/gyms/${gymId}/starter-routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to save routes')
  }
}

export function mapToEditableRoute(route: GymConfigPayload['routes'][number]) {
  return {
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
  }
}
