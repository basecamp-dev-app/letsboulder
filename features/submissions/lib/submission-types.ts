import type { Database } from '@/types/database'
import { VALID_GRADES, isValidGrade } from '@/lib/grade-constants'
import type { GpsData, FaceDirection, FaceDirectionsByImage } from '@/types/domain'
import { FACE_DIRECTIONS } from '@/types/domain'
import type { ClimbRouteType } from '@/lib/enums'

import type { RoutePoint } from '@/types/climbing'

export { VALID_GRADES, FACE_DIRECTIONS, isValidGrade }
export type { Grade } from '@/lib/grade-constants'
export type { GpsData, FaceDirection, FaceDirectionsByImage }
export type { RoutePoint }
export type { ClimbRouteType }
export { CLIMB_ROUTE_TYPES } from '@/types/climbing'

export type Region = Pick<Database['public']['Tables']['regions']['Row'], 'id' | 'name' | 'country_code' | 'center_lat' | 'center_lon' | 'created_at'>

export interface AtlasCountryContext {
  countryId: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  unRegionName: string | null
  continentName: string | null
}

export interface SubmissionCrag {
  id: string
  name: string
  latitude: number
  longitude: number
  countryId?: string | null
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
  climbType?: ClimbRouteType
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
  sectorId?: string | null
}

export interface CragImageSelection {
  mode: 'crag-image'
  cragImageId: string
  imageUrl: string
  linkedImageId: string | null
  width: number | null
  height: number | null
}

export type ImageSelection = ExistingImageSelection | NewImageSelection | CragImageSelection

export interface SubmissionContext {
  crag: Pick<SubmissionCrag, 'id' | 'name' | 'latitude' | 'longitude'> | null
  image: ImageSelection | null
  imageGps: { latitude: number; longitude: number } | null
  faceDirectionsByImage: FaceDirectionsByImage
  routes: NewRouteData[]
  routeType: ClimbRouteType | null
  sectorId: string | null
}

export type SubmissionStep =
  | { step: 'image' }
  | { step: 'cragImage' }
  | { step: 'location'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'faceDirection'; imageGps: { latitude: number; longitude: number } | null }
  | { step: 'crag'; imageGps: { latitude: number; longitude: number } | null; cragId?: string; cragName?: string }
  | { step: 'draw'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string; defaultClimbType?: ClimbRouteType }
  | { step: 'climbType'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; draftKey?: string }
  | { step: 'review'; imageGps: { latitude: number; longitude: number } | null; cragId: string; cragName: string; image: ImageSelection; routes: NewRouteData[]; draftKey?: string }
  | { step: 'submitting' }
  | { step: 'success'; climbsCreated: number; imageId?: string; climbId?: string; routeId?: string }
  | { step: 'error'; message: string }

export function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
