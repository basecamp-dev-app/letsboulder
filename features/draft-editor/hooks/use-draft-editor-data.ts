'use client'

import { useMemo } from 'react'
import { serializeRouteEditorRoutes, type RouteEditorRouteInput } from '@/features/route-editor/public'
import type { DraftImagePayload, DraftPayload, DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

export interface DraftEditorDataInput {
  draft: DraftPayload | null
  routeType: string
  routesByImageId: Record<string, DraftRoute[]>
  manageImages: Array<{ imageId: string }>
}

export function buildDraftImagesPayload(
  images: DraftImagePayload[],
  routesByImageId: Record<string, DraftRoute[]>,
  routeType: string,
  orderedManageImages?: Array<{ imageId: string }>,
): Array<{ id: string; display_order: number; route_data: Record<string, unknown> }> {
  const imageOrderLookup = new Map((orderedManageImages || []).map((image, index) => [image.imageId, index]))
  return images
    .slice()
    .sort((a, b) => {
      const left = imageOrderLookup.get(a.id)
      const right = imageOrderLookup.get(b.id)
      if (typeof left === 'number' && typeof right === 'number') return left - right
      if (typeof left === 'number') return -1
      if (typeof right === 'number') return 1
      return a.display_order - b.display_order
    })
    .map((image, index) => {
      const routes = routesByImageId[image.id] || []
      const completedRoutes = serializeRouteEditorRoutes(routes.map((route, routeIndex): RouteEditorRouteInput => ({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climbType || routeType,
        points: route.points,
        sequenceOrder: routeIndex,
        imageWidth: route.imageWidth,
        imageHeight: route.imageHeight,
      })), image.width || 1200, image.height || 1200)

      const baseRouteData = image.route_data && typeof image.route_data === 'object' ? image.route_data : {}

      return {
        id: image.id,
        display_order: index,
        route_data: {
          ...baseRouteData,
          completedRoutes,
        },
      }
    })
}

export function useDraftEditorData({ draft, routeType, routesByImageId, manageImages }: DraftEditorDataInput) {
  return useMemo(() => {
    const imagesPayload = draft ? buildDraftImagesPayload(draft.images, routesByImageId, routeType, manageImages) : []
    return {
      imagesPayload,
      imagesPayloadSignature: JSON.stringify(imagesPayload),
    }
  }, [draft, manageImages, routeType, routesByImageId])
}
