export interface ImageInfoRow {
  id: string
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
}

export interface ClimbInfo {
  id: string
  name: string
  grade: string
  slug?: string | null
  route_type: string | null
  description: string | null
}

export interface FullContextRouteLine {
  id: string
  points: unknown
  color: string | null
  image_width: number | null
  image_height: number | null
  climb_id: string
  climb: ClimbInfo | null
}

export interface FaceRouteSummary {
  id: string
  climb_id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
}

export interface CompleteSummaryFace {
  image_id: string | null
  index: number
  is_primary: boolean
  url: string | null
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata: {
    width: number | null
    height: number | null
  } | null
  routes: FaceRouteSummary[]
  has_routes: boolean
}

export interface CompleteSummaryPayload {
  faces: CompleteSummaryFace[]
  summary: {
    total_faces: number
    total_routes: number
  }
}

export interface FullContextPayload {
  climb: ClimbInfo | null
  primary_image: ImageInfoRow | null
  primary_route_lines: FullContextRouteLine[]
  faces: CompleteSummaryFace[]
  summary?: {
    total_faces: number
    total_routes: number
  }
}

export interface LegacyClimbRow {
  id: string
  name: string
  grade: string
  slug?: string | null
  route_type: string | null
  image_url: string
  coordinates: unknown
  crag_id?: string | null
}

export interface CragRow {
  id: string
  country_code: string | null
  slug: string | null
  name?: string | null
}

export interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  is_public: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

export interface RouteFaceRow {
  route_id: string
  image_id: string
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  climb: ClimbInfo | ClimbInfo[] | null
  image: { id: string; url: string | null; width: number | null; height: number | null; face_directions: string[] | null } | Array<{ id: string; url: string | null; width: number | null; height: number | null; face_directions: string[] | null }> | null
  crag_image: { id: string; url: string | null; width: number | null; height: number | null; linked_image_id: string | null } | null
}

export interface RouteFaceQueryRow {
  id: string
  image_id: string
  color: string | null
  points: unknown
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
  climb: ClimbInfo | ClimbInfo[] | null
  image: RouteFaceRow['image']
}
