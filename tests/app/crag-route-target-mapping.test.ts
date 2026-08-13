import { describe, expect, test } from 'vitest'
import { buildRouteTargetMapsFromPageRows, hasCompleteRouteTargets, resolveCragRouteDestination } from '@/features/crags/lib/crag-route-targets'

type RouteLineTargetRow = {
  id: string
  image_id: string
  climb_id: string
  climbs: { slug: string | null } | Array<{ slug: string | null }> | null
  images: { url: string | null } | Array<{ url: string | null }> | null
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
    const joinedImage = Array.isArray(row.images) ? row.images[0] : row.images
    const imageUrl = image?.url || joinedImage?.url || null
    if (!imageUrl) continue
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    nextRoutePreviewByClimbId[effectiveClimbId] = {
      imageId: row.image_id,
      imageUrl,
    }
    nextRouteNavigationTargetByClimbId[effectiveClimbId] = {
      climbId: effectiveClimbId,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: row.image_id,
      displayImageId: row.image_id,
      displayImageUrl: imageUrl,
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
        images: { url: 'https://example.com/image-1.jpg' },
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

  test('builds navigation target from joined image url when image is not loaded', () => {
    const routeTargetsData: RouteLineTargetRow[] = [
      {
        id: 'route-line-2',
        image_id: 'image-2',
        climb_id: 'local-climb-2',
        climbs: { slug: 'hidden-image-slug' },
        images: { url: 'https://example.com/image-2.jpg' },
      },
    ]

    const imageById = new Map<string, ImageRecord>()

    const effectiveClimbIdByClimbId = {
      'local-climb-2': 'shared-climb-2',
      'shared-climb-2': 'shared-climb-2',
    }

    const result = mapRouteTargetsByEffectiveClimbId(routeTargetsData, imageById, effectiveClimbIdByClimbId)

    expect(result.nextRoutePreviewByClimbId['shared-climb-2']).toEqual({
      imageId: 'image-2',
      imageUrl: 'https://example.com/image-2.jpg',
    })

    expect(result.nextRouteNavigationTargetByClimbId['shared-climb-2']).toEqual({
      climbId: 'shared-climb-2',
      routeId: 'route-line-2',
      climbSlug: 'hidden-image-slug',
      imageId: 'image-2',
      displayImageId: 'image-2',
      displayImageUrl: 'https://example.com/image-2.jpg',
    })
  })

  test('normalizes route target page rows to canonical static image urls', () => {
    const result = buildRouteTargetMapsFromPageRows([
      {
        effective_climb_id: 'climb-1',
        climb_slug: 'giant-panda',
        preview_image_id: 'image-1',
        navigation_route_id: 'route-line-1',
        navigation_image_id: 'image-1',
        route_image_ids: ['image-1'],
      },
    ])

    expect(result.nextRoutePreviewByClimbId['climb-1']).toEqual({
      imageId: 'image-1',
      imageUrl: '/images/image-1/v1/detail.jpg',
    })

    expect(result.nextRouteNavigationTargetByClimbId['climb-1']).toEqual({
      climbId: 'climb-1',
      routeId: 'route-line-1',
      climbSlug: 'giant-panda',
      imageId: 'image-1',
      displayImageId: 'image-1',
      displayImageUrl: '/images/image-1/v1/detail.jpg',
    })
  })

  test('marks route targets complete when every route has image ids, preview, and navigation target', () => {
    const routes = [
      {
        id: 'shared-climb-1',
        name: 'Route One',
        grade: '6A',
        slug: 'route-one',
        routeType: null,
        directions: [],
        hasTopo: true,
        topoImageCount: 1,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
    ]

    expect(hasCompleteRouteTargets(
      routes,
      { 'shared-climb-1': ['image-1'] },
      { 'shared-climb-1': { imageId: 'image-1', imageUrl: 'https://example.com/image-1.jpg' } },
      {
        'shared-climb-1': {
          climbId: 'shared-climb-1',
          routeId: 'route-line-1',
          climbSlug: 'route-one',
          imageId: 'image-1',
          displayImageId: 'image-1',
          displayImageUrl: 'https://example.com/image-1.jpg',
        },
      }
    )).toBe(true)
  })

  test('falls back to canonical route page when preview exists but route target is unresolved', () => {
    const destination = resolveCragRouteDestination(
      {
        id: 'shared-climb-3',
        name: 'Route Three',
        grade: '7A',
        slug: 'route-three',
        routeType: null,
        directions: [],
        hasTopo: true,
        topoImageCount: 1,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
      {},
      {
        'shared-climb-3': {
          imageId: 'image-3',
          imageUrl: 'https://example.com/image-3.jpg',
        },
      },
      {},
      '/france/example-crag',
      false,
    )

    expect(destination).toEqual({
      href: '/france/example-crag/route-three',
      ready: true,
    })
  })

  test('prefers the image navigation target when it is available', () => {
    const destination = resolveCragRouteDestination(
      {
        id: 'shared-climb-nav',
        name: 'Route Nav',
        grade: '7A',
        slug: 'route-nav',
        routeType: null,
        directions: [],
        hasTopo: true,
        topoImageCount: 1,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
      {
        'shared-climb-nav': {
          climbId: 'shared-climb-nav',
          routeId: 'route-line-nav',
          climbSlug: 'route-nav',
          imageId: 'image-nav',
          displayImageId: 'image-nav',
          displayImageUrl: 'https://example.com/image-nav.jpg',
        },
      },
      {},
      {},
      '/fr/example-crag',
      false,
    )

    expect(destination).toEqual({
      href: '/fr/example-crag/i/image-nav?image=image-nav&route=route-line-nav&climb=shared-climb-nav',
      ready: true,
    })
  })

  test('uses preview plus default target when no navigation target exists', () => {
    const destination = resolveCragRouteDestination(
      {
        id: 'shared-climb-preview',
        name: 'Route Preview',
        grade: '6C',
        slug: 'route-preview',
        routeType: null,
        directions: [],
        hasTopo: true,
        topoImageCount: 1,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
      {},
      {
        'shared-climb-preview': {
          imageId: 'image-preview',
          imageUrl: 'https://example.com/image-preview.jpg',
        },
      },
      {
        'image-preview': {
          climbId: 'shared-climb-preview',
          routeId: 'route-line-preview',
          climbSlug: 'route-preview',
          imageId: 'image-preview',
        },
      },
      '/fr/example-crag',
      false,
    )

    expect(destination).toEqual({
      href: '/fr/example-crag/i/image-preview?image=image-preview&route=route-line-preview&climb=shared-climb-preview',
      ready: true,
    })
  })

  test('uses a safe climb destination when offline', () => {
    const destination = resolveCragRouteDestination(
      {
        id: 'shared-climb-offline',
        name: 'Route Offline',
        grade: '6B',
        slug: 'route-offline',
        routeType: null,
        directions: [],
        hasTopo: true,
        topoImageCount: 1,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
      {},
      {
        'shared-climb-offline': {
          imageId: 'image-offline',
          imageUrl: 'https://example.com/image-offline.jpg',
        },
      },
      {},
      '/fr/example-crag',
      true,
    )

    expect(destination).toEqual({
      href: '/climb/shared-climb-offline',
      ready: true,
    })
  })

  test('falls back to climb page when no route target data is available', () => {
    const destination = resolveCragRouteDestination(
      {
        id: 'shared-climb-4',
        name: 'Route Four',
        grade: '6C',
        slug: null,
        routeType: null,
        directions: [],
        hasTopo: false,
        topoImageCount: 0,
        ratingAvg: null,
        ratingCount: 0,
        weightedRating: null,
        sendCount: 0,
        recentSendCount60d: 0,
      },
      {},
      {},
      {},
      null,
      false,
    )

    expect(destination).toEqual({
      href: '/climb/shared-climb-4',
      ready: true,
    })
  })
})
