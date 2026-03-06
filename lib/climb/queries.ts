import type { RoutePoint } from '@/lib/useRouteSelection'

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
  url: string
  crag_id: string | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
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
  climbId: string
  climbName: string
  version: string
  manifestUrl: string
  pageUrl: string
  mediaUrls: string[]
  mediaCount: number
  estimatedBytes: number
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
