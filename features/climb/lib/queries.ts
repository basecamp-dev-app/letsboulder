import type { RoutePoint } from '@/types/domain'

export interface ClimbPackPublicSubmitter {
  id: string
  displayName: string
  contributionCreditPlatform: string | null
  contributionCreditHandle: string | null
  profileContributionCreditPlatform: string | null
  profileContributionCreditHandle: string | null
}

export interface ClimbPackClimbInfo {
  id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
}

export interface ClimbPackImageInfo {
  id: string
  display_image_id?: string | null
  url: string
  crag_id: string | null
  latitude: number | null
  longitude: number | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  face_directions: string[] | null
  media_ref: string | null
  cache_key: string | null
  version: string | null
}

export interface ClimbPackRouteLine {
  id: string
  points: RoutePoint[] | string | null
  color: string | null
  image_width: number | null
  image_height: number | null
  climb_id: string
  climb: ClimbPackClimbInfo | null
}

export interface ClimbPackFaceRoute {
  id: string
  climb_id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
  color: string | null
  points: RoutePoint[] | string | null
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
}

export interface ClimbPackFaceItem {
  id: string
  index?: number
  image_id?: string | null
  display_image_id?: string | null
  is_primary: boolean
  url: string
  has_routes: boolean
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata?: {
    width: number | null
    height: number | null
  }
  routes?: ClimbPackFaceRoute[]
  media_ref: string | null
  cache_key: string | null
  version: string | null
}

export interface ClimbOfflinePackManifest {
  packId: string
  type?: 'climb'
  climbId: string
  climbName: string
  version: string
  manifestUrl: string
  pageUrl: string
  mediaUrls: string[]
  mediaCount: number
  estimatedBytes: number
  canonicalPath?: string
  cragId?: string | null
  coverImageUrl?: string | null
  primaryPin?: OfflineMapPin | null
  tileUrls?: string[]
  tileCount?: number
}

export interface OfflineMapPin {
  climbId: string
  climbName: string
  canonicalPath: string
  coverImageUrl: string | null
  latitude: number
  longitude: number
}

export interface OfflineTileManifest {
  minZoom: number
  maxZoom: number
  tileCount: number
  tileUrls: string[]
}

export interface CragOfflinePackClimbSummary {
  climbId: string
  climbName: string
  canonicalPath: string
  manifestUrl: string
  versionHash: string
  estimatedBytes: number
  mediaCount: number
  coverImageUrl?: string | null
  primaryPin?: OfflineMapPin | null
}

export interface CragOfflinePackManifest {
  packId: string
  type: 'crag'
  cragId: string
  cragName: string
  canonicalPath: string
  manifestUrl: string
  cragVersionHash: string
  estimatedBytes: number
  climbCount: number
  mediaCount: number
  climbs: CragOfflinePackClimbSummary[]
  savedPins?: OfflineMapPin[]
  tileManifest?: OfflineTileManifest | null
  removedClimbIds: string[]
  failedClimbIds?: string[]
  warning?: string | null
}

export interface ClimbPackResponse {
  climb: ClimbPackClimbInfo | null
  primary_image: ClimbPackImageInfo | null
  primary_route_lines: ClimbPackRouteLine[]
  faces: ClimbPackFaceItem[]
  summary?: {
    total_faces: number
    total_routes: number
  }
  crag_path: string | null
  public_submitter: ClimbPackPublicSubmitter | null
  offline_pack: ClimbOfflinePackManifest
}

export const climbOfflinePackQueryKey = (climbId: string) => ['climb', climbId, 'offline-pack'] as const

export async function fetchClimbOfflinePack(climbId: string): Promise<ClimbPackResponse> {
  const response = await fetch(`/api/offline-packs/climbs/${climbId}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load climb')
  }

  return response.json() as Promise<ClimbPackResponse>
}

export async function fetchCragOfflinePack(cragId: string): Promise<CragOfflinePackManifest> {
  const response = await fetch(`/api/offline-packs/crags/${cragId}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(payload.error || 'Failed to load crag offline pack')
  }

  return response.json() as Promise<CragOfflinePackManifest>
}
