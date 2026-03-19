import { describe, expect, test } from 'vitest'

type RouteLineTargetRow = {
  id: string
  image_id: string
  climb_id: string
  climbs: { slug: string | null } | Array<{ slug: string | null }> | null
}

type ImageRecord = {
  url: string
}

function mapRouteTargetsByEffectiveClimbId(
  routeTargetsData: RouteLineTargetRow[],
  imageById: Map<string, ImageRecord>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextRoutePreviewByClimbId: Record<string, { imageId: string; imageUrl: string }> = {}
  const nextRouteNavigationTargetByClimbId: Record<string, {
    climbId: string
    routeId: string
    climbSlug: string | null
    imageId: string
    displayImageId: string
    displayImageUrl: string
  }> = {}

  for (const row of routeTargetsData) {
    const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
    if (nextRouteNavigationTargetByClimbId[effectiveClimbId]) continue
    const image = imageById.get(row.image_id)
    if (!image) continue
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    nextRoutePreviewByClimbId[effectiveClimbId] = {
      imageId: row.image_id,
      imageUrl: image.url,
    }
    nextRouteNavigationTargetByClimbId[effectiveClimbId] = {
      climbId: effectiveClimbId,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: row.image_id,
      displayImageId: row.image_id,
      displayImageUrl: image.url,
    }
  }

  return { nextRoutePreviewByClimbId, nextRouteNavigationTargetByClimbId }
}

describe('crag route target mapping', () => {
  test('maps local alias route_lines back to the shared climb id', () => {
    const routeTargetsData: RouteLineTargetRow[] = [
      {
        id: 'route-line-1',
        image_id: 'image-1',
        climb_id: 'local-climb-1',
        climbs: { slug: 'shared-slug' },
      },
    ]

    const imageById = new Map([
      ['image-1', { url: 'https://example.com/image-1.jpg' }],
    ])

    const effectiveClimbIdByClimbId = {
      'local-climb-1': 'shared-climb-1',
      'shared-climb-1': 'shared-climb-1',
    }

    const result = mapRouteTargetsByEffectiveClimbId(routeTargetsData, imageById, effectiveClimbIdByClimbId)

    expect(result.nextRoutePreviewByClimbId['shared-climb-1']).toEqual({
      imageId: 'image-1',
      imageUrl: 'https://example.com/image-1.jpg',
    })

    expect(result.nextRouteNavigationTargetByClimbId['shared-climb-1']).toEqual({
      climbId: 'shared-climb-1',
      routeId: 'route-line-1',
      climbSlug: 'shared-slug',
      imageId: 'image-1',
      displayImageId: 'image-1',
      displayImageUrl: 'https://example.com/image-1.jpg',
    })
  })
})
