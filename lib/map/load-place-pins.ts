import type { PlacePin } from '@/lib/map/place-pins'

interface PlacePinsResponse {
  pins?: PlacePin[]
}

export async function loadPlacePins(signal?: AbortSignal): Promise<PlacePin[]> {
  const response = await fetch('/api/crags/pins', { signal })
  if (!response.ok) {
    throw new Error(`Failed to load place pins (${response.status})`)
  }

  const payload = await response.json() as PlacePinsResponse
  return Array.isArray(payload.pins) ? payload.pins : []
}
