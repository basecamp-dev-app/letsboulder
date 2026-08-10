import { normalizeViewportQuery, type MapViewportQuery } from '@/lib/map/map-bounds'
import type { MapPinsApiResponse, ViewportMapFeature } from '@/lib/map/place-pins'

export interface MapPinsResult {
  features: ViewportMapFeature[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isViewportMapFeature(value: unknown): value is ViewportMapFeature {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.latitude !== 'number'
    || typeof value.longitude !== 'number'
    || typeof value.point_count !== 'number'
    || typeof value.is_cluster !== 'boolean') return false

  if (value.is_cluster) return value.type === 'cluster'

  return (value.type === 'crag' || value.type === 'gym')
    && typeof value.name === 'string'
    && isNullableString(value.slug)
    && isNullableString(value.country_code)
    && (typeof value.image_count === 'number' || value.image_count === null)
    && (typeof value.route_count === 'number' || value.route_count === null)
}

function isMapPinsSuccess(payload: unknown): payload is Extract<MapPinsApiResponse, { pins: ViewportMapFeature[] }> {
  return isRecord(payload) && Array.isArray(payload.pins) && payload.pins.every(isViewportMapFeature)
}

export async function loadPlacePins(viewport: MapViewportQuery, signal?: AbortSignal): Promise<MapPinsResult> {
  const normalizedViewport = normalizeViewportQuery(viewport)
  const parameters = new URLSearchParams({
    west: String(normalizedViewport.bounds.west),
    south: String(normalizedViewport.bounds.south),
    east: String(normalizedViewport.bounds.east),
    north: String(normalizedViewport.bounds.north),
    zoom: String(normalizedViewport.zoom),
  })
  const response = await fetch(`/api/crags/pins?${parameters}`, { signal })
  if (!response.ok) {
    throw new Error(`Failed to load place pins (${response.status})`)
  }

  const payload: unknown = await response.json()
  if (!isMapPinsSuccess(payload)) {
    const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Invalid map pins response'
    throw new Error(message)
  }

  return { features: payload.pins }
}
