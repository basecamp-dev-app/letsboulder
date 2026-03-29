'use client'

import { useMemo } from 'react'

export interface DraftImagePayload {
  id: string
  display_order: number
  route_data: Record<string, unknown> | null
  proxy_url: string | null
  readiness_status: 'ready' | 'processing' | 'error'
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
}

export interface DraftPayload {
  id: string
  user_id: string
  crag_id: string | null
  status: string
  updated_at: string
  last_edited_by: string | null
  metadata: Record<string, unknown> | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
}

export interface DraftRoute {
  id: string
  name: string
  grade: string
  description?: string
  climbType?: string
  points: { x: number; y: number }[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

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
      const completedRoutes = routes.map((route, routeIndex) => ({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climbType || routeType,
        points: route.points,
        sequenceOrder: routeIndex,
        imageWidth: route.imageWidth || image.width || 1200,
        imageHeight: route.imageHeight || image.height || 1200,
      }))

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
