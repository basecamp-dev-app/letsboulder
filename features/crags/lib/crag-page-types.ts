import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface CragPageCrag {
  id: string
  name: string
  slug: string | null
  country_id?: string | null
  country_code: string | null
  region_name?: string | null
  sub_area?: string | null
  country_name?: string | null
  admin_region_name?: string | null
  un_region_name?: string | null
  continent_name?: string | null
  latitude: number | null
  longitude: number | null
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  climbing_areas?: {
    id: string
    name: string
  }
}

export interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}

export interface CragRoute {
  id: string
  name: string
  grade: string
  slug: string | null
  routeType: string | null
  directions: string[]
  hasTopo: boolean
  topoImageCount: number
  ratingAvg: number | null
  ratingCount: number
  weightedRating: number | null
  sendCount: number
  recentSendCount60d: number
}

export interface RoutePreview {
  imageId: string
  imageUrl: string
}

export interface RouteNavigationTarget {
  climbId: string
  routeId: string
  climbSlug: string | null
  imageId: string
  displayImageId: string
  displayImageUrl: string
}

export interface InitialCragRouteData {
  initialRoutes: CragRoute[]
  initialRouteImageIdsByClimbId: Record<string, string[]>
  initialRoutePreviewByClimbId: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  initialImages: ImageData[]
  initialCragCenter: [number, number] | null
  loadedAt: number
}

export interface CragPageServerCrag {
  id: string
  name: string
  slug: string | null
  country_id?: string | null
  country_code: string | null
  region_name?: string | null
  sub_area?: string | null
  country?: string | null
  country_name?: string | null
  admin_region_name?: string | null
  un_region_name?: string | null
  continent_name?: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
}
