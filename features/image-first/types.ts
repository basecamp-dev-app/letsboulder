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
  pathData: RoutePoint[] | string | null
  color: string
  isPrimary: boolean
}

export interface ImageFirstAttribution {
  ownerRoleLabel: string
  ownerDisplayLabel: string
  ownerProfileId: string | null
  formattedContributionHandle: string | null
  contributionCreditUrl: string | null
  communityEditorsRoleLabel: string
  communityEditorsCount: number
}

export interface ImageFirstPayload {
  heroImage: {
    displayImageId: string
    src: string
    width: number
    height: number
    latitude: number | null
    longitude: number | null
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
  cragId: string
  cragSlug: string
  cragName: string
  countryCode: string
  mapPins: Array<{
    imageId: string
    latitude: number
    longitude: number
    activeImageIds: string[]
    primaryImageId: string
    routeSlug: string | null
  }>
  attribution: ImageFirstAttribution
}
