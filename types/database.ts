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
  boundary: GeoJSONPolygon | null
}

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface Image {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  crag_id: string | null
  is_verified: boolean
  verification_count: number
  route_lines: RouteLine[]
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
