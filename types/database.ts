export interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  type: string
  address: {
    city?: string
    town?: string
    village?: string
    state?: string
    country: string
    country_code: string
  }
}

export interface Region {
  id: string
  name: string
  country_code: string | null
  center_lat: number | null
  center_lon: number | null
}

export interface Crag {
  id: string
  name: string
  latitude: number
  longitude: number
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
}

export interface Place {
  id: string
  type: 'crag' | 'gym'
  name: string
  latitude: number | null
  longitude: number | null
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  primary_discipline: string | null
  disciplines: string[]
}

export interface Image {
  id: string
  url: string
  storage_provider?: 'supabase' | 'r2'
  original_bucket?: string | null
  original_key?: string | null
  original_mime_type?: string | null
  original_bytes?: number | null
  original_width?: number | null
  original_height?: number | null
  asset_version?: number
  variants?: ImageVariantManifest
  visibility?: 'private' | 'public'
  processing_status?: 'pending' | 'queued' | 'processing' | 'ready' | 'failed'
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'skipped' | 'error' | null
  moderation_provider?: string | null
  moderation_error?: string | null
  checksum_sha256?: string | null
  processed_at?: string | null
  latitude: number | null
  longitude: number | null
  crag_id: string | null
  is_verified: boolean
  verification_count: number
  route_lines: RouteLine[]
}

export interface ImageVariantFormat {
  path: string
  width: number
  height: number
  bytes?: number | null
  contentType?: string | null
}

export interface ImageVariantSet {
  avif?: ImageVariantFormat
  webp?: ImageVariantFormat
  jpeg?: ImageVariantFormat
}

export interface ImageVariantManifest {
  thumb?: ImageVariantSet
  card?: ImageVariantSet
  detail?: ImageVariantSet
  topo?: ImageVariantSet
  full?: ImageVariantSet
}

export interface SubmissionDraftImage {
  id: string
  draft_id: string
  display_order: number
  storage_bucket: string
  storage_path: string
  storage_provider?: 'supabase' | 'r2'
  original_bucket?: string | null
  original_key?: string | null
  original_mime_type?: string | null
  original_bytes?: number | null
  width: number | null
  height: number | null
  preview_variants?: ImageVariantManifest
  processing_status?: 'pending' | 'queued' | 'processing' | 'ready' | 'failed'
  checksum_sha256?: string | null
  processed_at?: string | null
  created_at: string
  updated_at: string
}

export interface MediaJob {
  id: string
  image_id: string
  job_type: 'ingest_image'
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
  run_at: string
  locked_at: string | null
  locked_by: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface Climb {
  id: string
  name: string | null
  grade: string
  status: string | null
  description: string | null
  is_verified: boolean
  verification_count: number
}

export interface RouteLine {
  id: string
  image_id: string
  climb_id: string
  points: number[][]
  color: string
  climbs?: Climb
}

export interface UserClimb {
  id: string
  user_id: string
  climb_id: string
  style: 'top' | 'flash' | 'onsight'
  date_climbed: string | null
  created_at: string
  climbs?: Climb
}

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  bio?: string | null
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
  is_public: boolean
  total_climbs?: number
  total_points?: number
  highest_grade?: string
}

export interface ClimbVerification {
  id: string
  climb_id: string
  user_id: string
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
  pagination: {
    page: number
    limit: number
    total_users: number
    total_pages: number
  }
}
