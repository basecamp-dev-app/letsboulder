import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import type { RoutePoint } from '@/lib/submission-types'

export type EditorLocationMode = 'shared' | 'custom'

export interface EditorImageLocation {
  imageId: string
  order: number
  label: string
  latitude: number | null
  longitude: number | null
  locationMode: EditorLocationMode
}

export interface EditorRouteOrderItem {
  id: string
  points: RoutePoint[]
}

export function resolveLocationMode(value: unknown): EditorLocationMode {
  return value === 'custom' ? 'custom' : 'shared'
}

export function reorderItemsByIds<T extends { imageId: string }>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((item) => [item.imageId, item]))
  const reordered: T[] = []

  for (const [index, imageId] of orderedIds.entries()) {
    const item = byId.get(imageId)
    if (!item) continue
    reordered.push({ ...item, index } as T)
  }

  return reordered
}

export function resequenceRoutes<T extends { id: string }>(routes: T[], orderedIds: string[]): T[] {
  const byId = new Map(routes.map((route) => [route.id, route]))
  const reordered: T[] = []

  for (const [index, routeId] of orderedIds.entries()) {
    const route = byId.get(routeId)
    if (!route) continue
    reordered.push({ ...route, sequenceOrder: index, sequence_order: index } as T)
  }

  return reordered
}

export function buildMapPins(images: EditorImageLocation[]): LightweightCragMapPin[] {
  const pins: LightweightCragMapPin[] = []

  for (const image of images) {
    if (typeof image.latitude !== 'number' || typeof image.longitude !== 'number') continue
    if (pins.some((pin) => pin.latitude === image.latitude && pin.longitude === image.longitude)) continue
    pins.push({
      id: image.imageId,
      latitude: image.latitude,
      longitude: image.longitude,
      label: String(image.order + 1),
      interactive: true,
      tone: 'draft',
    })
  }

  return pins
}
