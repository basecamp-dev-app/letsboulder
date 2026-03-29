export interface RoutePoint {
  x: number
  y: number
}

export interface EditableRoutePayload {
  id: string
  name: string
  description?: string
  points: RoutePoint[]
  sequenceOrder?: number
}

export interface NewRoutePayload {
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

export interface DeleteRoutePayload {
  routeLineId: string
  transferLogsToSameName?: boolean
  targetRouteLineId?: string | null
}

export interface TransferTargetCandidate {
  routeLineId: string
  climbId: string
  climbName: string
  grade: string | null
}

export const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const

export const MAX_ROUTES_PER_REQUEST = 40

export function normalizeRouteType(value: string | null | undefined): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'

  if (!VALID_ROUTE_TYPES.includes(normalized as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }

  return normalized as (typeof VALID_ROUTE_TYPES)[number]
}

export function isValidPoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoutePoint>
  return (
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y)
  )
}

export function normalizeRoutes(value: unknown): EditableRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: EditableRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const route = item as Partial<EditableRoutePayload>
    if (typeof route.id !== 'string' || !route.id) return null
    if (typeof route.name !== 'string') return null
    if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') return null
    if (!Array.isArray(route.points) || route.points.length < 2 || !route.points.every(isValidPoint)) return null

    routes.push({
      id: route.id,
      name: route.name,
      description: route.description,
      points: route.points,
      sequenceOrder: typeof route.sequenceOrder === 'number' ? route.sequenceOrder : undefined,
    })
  }

  return routes
}

export function normalizeNewRoutes(value: unknown): NewRoutePayload[] | null {
  if (!Array.isArray(value)) return null

  const routes: NewRoutePayload[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const route = item as Partial<NewRoutePayload>
    if (typeof route.name !== 'string') return null
    if (typeof route.grade !== 'string') return null
    if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') return null
    if (!Array.isArray(route.points) || route.points.length < 2 || !route.points.every(isValidPoint)) return null
    if (typeof route.sequenceOrder !== 'number' || !Number.isFinite(route.sequenceOrder)) return null
    if (typeof route.imageWidth !== 'number' || !Number.isFinite(route.imageWidth) || route.imageWidth <= 0) return null
    if (typeof route.imageHeight !== 'number' || !Number.isFinite(route.imageHeight) || route.imageHeight <= 0) return null

    routes.push({
      name: route.name,
      grade: route.grade,
      description: route.description,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
      imageWidth: route.imageWidth,
      imageHeight: route.imageHeight,
    })
  }

  return routes
}

export function normalizeDeletePayload(value: unknown): DeleteRoutePayload | null {
  if (!value || typeof value !== 'object') return null

  const routeLineId = typeof (value as { routeLineId?: unknown }).routeLineId === 'string'
    ? (value as { routeLineId: string }).routeLineId.trim()
    : ''

  if (!routeLineId) return null

  const transferLogsToSameName = typeof (value as { transferLogsToSameName?: unknown }).transferLogsToSameName === 'boolean'
    ? (value as { transferLogsToSameName: boolean }).transferLogsToSameName
    : true

  const targetRouteLineIdRaw = (value as { targetRouteLineId?: unknown }).targetRouteLineId
  const targetRouteLineId = typeof targetRouteLineIdRaw === 'string' && targetRouteLineIdRaw.trim().length > 0
    ? targetRouteLineIdRaw.trim()
    : null

  return {
    routeLineId,
    transferLogsToSameName,
    targetRouteLineId,
  }
}

export function normalizeRouteNameForMatch(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

export function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}
