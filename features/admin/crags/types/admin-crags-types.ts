export interface AdminCrag {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  rock_type: string | null
  type: string | null
  region_tag: string | null
  sub_area: string | null
  has_primary_region_tag: boolean
  climb_count: number
  image_count: number
  route_type_counts?: Array<{ type: string; count: number }>
}

export interface CragImageRouteCandidate {
  imageId: string
  imageUrl: string | null
  createdAt: string | null
  climbCount: number
  climbNames: string[]
}

export interface MoveImageState {
  sourceCrag: AdminCrag
  imageId: string
}

export function formatRouteTypeLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-').replace('bouldering', 'boulder')
  return normalized
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
