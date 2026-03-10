import { VALID_GRADES, isValidGrade } from '@/lib/grade-constants'

export { VALID_GRADES }
export type { Grade } from '@/lib/grade-constants'

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
  countryCode?: string | null
  countryName?: string | null
  region_id: string | null
  regionName?: string | null
  subArea?: string | null
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
  image_width?: number
  image_height?: number
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
  climbType?: ClimbType
}

export type ImageSelectionMode = 'existing' | 'new' | 'crag-image'

export interface ExistingImageSelection {
  mode: 'existing'
  imageId: string
  imageUrl: string
  existingRouteLines?: RouteLine[]
}

export interface NewImageSelection {
  mode: 'new'
  images: NewUploadedImage[]
  primaryIndex: number
}

export interface NewUploadedImage {
  uploadedImageId?: string
  uploadedBucket: string
  uploadedPath: string
  uploadedUrl: string
  gpsData: GpsData | null
  captureDate: string | null
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

export interface CragImageSelection {
  mode: 'crag-image'
  cragImageId: string
  imageUrl: string
  linkedImageId: string | null
  width: number | null
  height: number | null
}

export interface GpsData {
  latitude: number
  longitude: number
}

export const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export type FaceDirection = typeof FACE_DIRECTIONS[number]
export type FaceDirectionsByImage = Record<number, FaceDirection[]>

export type ImageSelection = ExistingImageSelection | NewImageSelection | CragImageSelection

export type ClimbType = 'sport' | 'boulder' | 'trad' | 'deep-water-solo'

export interface SubmissionContext {
  crag: Pick<Crag, 'id' | 'name' | 'latitude' | 'longitude'> | null
  image: ImageSelection | null
  imageGps: { latitude: number; longitude: number } | null
  faceDirectionsByImage: FaceDirectionsByImage
  routes: NewRouteData[]
  routeType: ClimbType | null
}

export type SubmissionStep =
  | { step: 'image' }
  | { step: 'cragImage' }
  | { step: 'location'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'faceDirection'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'crag'; imageGps: { latitude: number; longitude: number } | null; cragId?: string; cragName?: string }
  | { step: 'draw'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string; defaultClimbType?: ClimbType }
  | { step: 'climbType'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string }
  | { step: 'review'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; routes: NewRouteData[]; draftKey?: string }
  | { step: 'submitting' }
  | { step: 'success'; climbsCreated: number; imageId?: string; climbId?: string; routeId?: string }
  | { step: 'error'; message: string }

export { isValidGrade }

export function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
