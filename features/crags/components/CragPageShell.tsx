import CragPageClient from '@/features/crags/components/CragPageClient'
import type { CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

interface CragPageShellProps {
  id: string
  initialCrag: CragPageCrag | null
  initialImages: ImageData[]
  initialRoutes: CragRoute[] | null
  initialRouteImageIdsByClimbId: Record<string, string[]>
  initialRoutePreviewByClimbId: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  initialCragCenter: [number, number] | null
  initialRouteTargetsComplete?: boolean
  initialCriticalImagesComplete?: boolean
  initialMapImagesComplete?: boolean
  initialPayloadLoadedAt?: number
  communityPlace?: CommunityPlaceInfo | null
  initialSelectedImageId?: string | null
  initialIsSaved?: boolean
}

export default function CragPageShell(props: CragPageShellProps) {
  return <CragPageClient {...props} />
}
