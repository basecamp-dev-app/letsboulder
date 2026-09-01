import type { RouteLine } from '@/features/submissions/public-client'
import type { ClimbRouteType, RoutePoint } from '@/types/climbing'
import type { OrientationDirection } from '@/features/submissions/public-client'
import type { MediaUploadStatus } from '@/features/media-upload/public'

export type ClimbType = ClimbRouteType

export interface DraftImagePayload {
  id: string
  display_order: number
  route_data: Record<string, unknown> | null
  storage_bucket: string | null
  storage_path: string | null
  readiness_status: 'ready' | 'processing' | 'error'
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
}

export interface DraftPayload {
  id: string
  user_id: string
  crag_id: string | null
  status: string
  updated_at: string
  last_edited_by: string | null
  metadata: Record<string, unknown> | null
  draft_kind?: 'new_submission' | 'topo_replacement'
  topo_replacement?: TopoReplacementDraft | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
}

export interface TopoReplacementRouteTarget {
  climbId: string
  name: string
  grade: string
  routeType: string | null
  description: string | null
  resolution: 'pending' | 'mapped' | 'not_visible'
  draftRouteId: string | null
}

export interface TopoReplacementDraft {
  id: string
  sourceImageId: string
  status: string
  reason: string
  routes: TopoReplacementRouteTarget[]
}

export interface CragImagePayload {
  id: string
  signed_url: string | null
  linked_image_id: string | null
  display_image_id?: string | null
  width: number | null
  height: number | null
  latitude?: number | null
  longitude?: number | null
}

export interface DraftSavePayload {
  images: Array<{
    id: string
    display_order: number
    route_data: Record<string, unknown>
  }>
  cragId: string | null
  metadata: Record<string, unknown>
}

export interface CanvasSourceMetadata {
  submission?: {
    canvasSource?: {
      kind?: 'draft-image' | 'crag-image'
      draftImageId?: string
      cragImageId?: string
      cragId?: string
    }
  }
}

export interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data?: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name?: string | null
  }
}

export interface DraftDeleteImageResponse {
  success: boolean
  deleted_image_id?: string
  draft?: {
    updated_at?: string
    metadata?: Record<string, unknown> | null
  } | null
}

export interface DraftPublishErrorResponse {
  error?: string
  missing_image_ids?: string[]
  publication?: {
    state?: 'public' | 'pending_crag_review'
    cragId?: string | null
  }
  published?: {
    defaultImageId?: string
    imageIds?: string[]
    routeLineIds?: string[]
    canonicalPath?: string | null
    defaultRouteId?: string | null
  }
}

export interface DraftRoute {
  id: string
  name: string
  grade: string
  description?: string
  climbType?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

export interface DraftLocationSearchResponse {
  results?: Array<{
    lat?: string
    lon?: string
  }>
}

export interface ManageImageTab {
  imageId: string
  sourceKind: 'draft-image' | 'crag-image'
  index: number
  label: string
  signedUrl: string
  latitude: number | null
  longitude: number | null
  locationMode?: 'shared' | 'custom'
  status?: MediaUploadStatus
  error?: string | null
  pendingClientId?: string | null
}

export type DraftCanvasSource =
  | { kind: 'draft-image'; draftImageId: string }
  | { kind: 'crag-image'; cragImageId: string; cragId: string }

export interface PublishedCragImagePin {
  id: string
  latitude: number
  longitude: number
}

export function isDraftImageReady(image: DraftImagePayload): boolean {
  return (image.readiness_status === 'ready' || image.readiness_status === 'processing') && !!image.storage_bucket && !!image.storage_path
}

export function buildManageImageLabel(index: number, imageId: string, defaultImageId: string | null, directions?: OrientationDirection[]): string {
  const directionsLabel = Array.isArray(directions) && directions.length > 0 ? ` (${directions.join('/')})` : ''
  return imageId === defaultImageId ? `Default${directionsLabel}` : `Image ${index + 1}${directionsLabel}`
}

export function resolveDraftClimbType(value: string): ClimbType {
  if (value === 'sport' || value === 'boulder' || value === 'trad' || value === 'deep-water-solo') {
    return value
  }
  return 'boulder'
}

export function isValidLocationCoordinate(latitude: number | null | undefined, longitude: number | null | undefined): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0)
}

export function parseDraftMarkerPosition(latitude: string, longitude: string): [number, number] | null {
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)
  return isValidLocationCoordinate(parsedLatitude, parsedLongitude) ? [parsedLatitude, parsedLongitude] : null
}

export function resolveEffectiveDraftPublishLocation(
  markerPosition: [number, number] | null,
  images: Array<Pick<ManageImageTab, 'latitude' | 'longitude'>>,
): [number, number] | null {
  if (markerPosition) return markerPosition

  const fallbackImage = images.find((image) => isValidLocationCoordinate(image.latitude, image.longitude)) || null
  if (!fallbackImage) return null

  return [fallbackImage.latitude as number, fallbackImage.longitude as number]
}

export function buildDraftRouteLines(
  activeRoutes: DraftRoute[],
  activeDraftImageId: string | null,
  routeType: string,
): RouteLine[] {
  return activeRoutes.map((route) => ({
    id: route.id,
    image_id: activeDraftImageId || 'draft-image',
    climb_id: route.id,
    points: route.points,
    color: 'red',
    sequence_order: route.sequenceOrder,
    image_width: route.imageWidth,
    image_height: route.imageHeight,
    created_at: 'draft-hydrated',
    climb: {
      id: route.id,
      name: route.name,
      grade: route.grade,
      status: 'draft',
      route_type: route.climbType || routeType,
      description: route.description || null,
    },
  }))
}
