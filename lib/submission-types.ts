export const VALID_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
] as const

export type Grade = typeof VALID_GRADES[number]

export interface Region {
  id: string
  name: string
  country_code: string | null
  center_lat: number | null
  center_lon: number | null
  created_at: string
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
  type: 'sport' | 'boulder' | 'trad' | 'mixed'
  created_at: string
}

export interface Image {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  capture_date: string | null
  crag_id: string | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
  created_at: string
  route_lines_count?: number
}

export interface Climb {
  id: string
  name: string | null
  grade: string
  status: 'pending' | 'approved' | 'rejected'
  route_type: string | null
  description: string | null
  user_id: string | null
  created_at: string
}

export interface RouteLine {
  id: string
  image_id: string
  climb_id: string
  points: RoutePoint[]
  color: string
  sequence_order: number
  created_at: string
  climb?: {
    id: string
    name: string | null
    grade: string
    status: string
    route_type?: string | null
    description?: string | null
  }
}

export interface RoutePoint {
  x: number
  y: number
}

export interface NewRouteData {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  imageNaturalWidth: number
  imageNaturalHeight: number
}

export type ImageSelectionMode = 'existing' | 'new'

export interface ExistingImageSelection {
  mode: 'existing'
  imageId: string
  imageUrl: string
  existingRouteLines?: RouteLine[]
}

export interface NewImageSelection {
  mode: 'new'
  file: File
  gpsData: GpsData | null
  captureDate: string | null
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  uploadedBucket: string
  uploadedPath: string
  uploadedUrl: string
}

export interface GpsData {
  latitude: number
  longitude: number
}

export const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export type FaceDirection = typeof FACE_DIRECTIONS[number]

export type ImageSelection = ExistingImageSelection | NewImageSelection

export type ClimbType = 'sport' | 'boulder' | 'trad' | 'deep-water-solo'

export interface SubmissionContext {
  crag: Pick<Crag, 'id' | 'name' | 'latitude' | 'longitude'> | null
  image: ImageSelection | null
  imageGps: { latitude: number; longitude: number } | null
  faceDirections: FaceDirection[]
  routes: NewRouteData[]
  routeType: ClimbType | null
}

export type SubmissionStep =
  | { step: 'image' }
  | { step: 'location'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'faceDirection'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'crag'; imageGps: { latitude: number; longitude: number } | null; cragId?: string; cragName?: string }
  | { step: 'draw'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string }
  | { step: 'climbType'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string }
  | { step: 'review'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; routes: NewRouteData[]; draftKey?: string }
  | { step: 'submitting' }
  | { step: 'success'; climbsCreated: number; imageId?: string }
  | { step: 'error'; message: string }

export function isValidGrade(grade: string): grade is Grade {
  return VALID_GRADES.includes(grade as Grade)
}

export function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
