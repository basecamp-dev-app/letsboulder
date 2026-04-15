import type { RoutePoint } from '@/types/domain'

export interface ImageFirstRouteLine {
  routeId: string
  climbId: string
  imageId: string
  climbSlug: string | null
  climbName: string
  climbGrade: string | null
  climbDescription: string | null
  climbRouteType: string | null
  climbAverageStars: number | null
  climbStarVotes: number | null
  pathData: RoutePoint[] | string | null
  color: string
  isPrimary: boolean
}

export interface ImageFirstPayload {
  heroImage: {
    displayImageId: string
    src: string
    width: number
    height: number
    priority: true
  }
  initialRoutes: ImageFirstRouteLine[]
  navigationContext: {
    orderedImageIds: string[]
    startIndex: number
    imageMap: Record<string, { src: string; width: number; height: number }>
    linkedImageIdByDisplayId: Record<string, string>
    stacks: Array<{ stackId: string; imageIds: string[] }>
    sectorMarkers: Record<string, { name: string; firstImageId: string }>
  }
  initialClimbId: string | null
  initialRouteId: string | null
  initialRouteSlug: string | null
  cragSlug: string
  countryCode: string
  mapPins: Array<{
    imageId: string
    latitude: number
    longitude: number
    activeImageIds: string[]
    routeSlug: string | null
  }>
  isAdmin: boolean
}
