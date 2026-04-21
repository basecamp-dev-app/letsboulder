import { describe, expect, test } from 'vitest'
import type { PersistedQueryState } from '@/lib/query-persistence'
import { buildShallowLocalCragClimbsFromQueries } from '@/features/offline/lib/shallow-local-crag-cache'
import { cragKeys } from '@/features/crags/lib/crag-queries'

describe('shallow local crag cache', () => {
  test('builds cached climb links from persisted crag queries', () => {
    const queries: PersistedQueryState[] = [
      {
        queryKey: cragKeys.routes('crag-1'),
        data: {
          routes: [
            {
              id: 'climb-1',
              name: 'First Roof',
              grade: '7A',
              slug: 'first-roof',
              routeType: 'boulder',
              directions: [],
              hasTopo: true,
              topoImageCount: 1,
              ratingAvg: null,
              ratingCount: 0,
              weightedRating: null,
              sendCount: 0,
              recentSendCount60d: 0,
            },
          ],
        },
      },
      {
        queryKey: cragKeys.images('crag-1'),
        data: {
          routeNavigationTargetByClimbId: {
            'climb-1': {
              climbId: 'climb-1',
              routeId: 'route-1',
              climbSlug: 'first-roof',
              imageId: 'image-1',
              displayImageId: 'display-1',
              displayImageUrl: 'https://example.com/display-1.jpg',
            },
          },
          routePreviewByClimbId: {
            'climb-1': {
              imageId: 'display-1',
              imageUrl: 'https://example.com/preview-1.jpg',
            },
          },
        },
      },
    ]

    expect(buildShallowLocalCragClimbsFromQueries(queries, 'crag-1', '/gb/test-crag')).toEqual([
      {
        id: 'climb-1',
        name: 'First Roof',
        grade: '7A',
        href: '/gb/test-crag/i/display-1?image=image-1&route=route-1&climb=climb-1',
        previewImageUrl: 'https://example.com/preview-1.jpg',
      },
    ])
  })

  test('returns an empty list when navigation targets are missing', () => {
    const queries: PersistedQueryState[] = [
      {
        queryKey: cragKeys.routes('crag-1'),
        data: {
          routes: [
            {
              id: 'climb-1',
              name: 'First Roof',
              grade: '7A',
              slug: 'first-roof',
              routeType: 'boulder',
              directions: [],
              hasTopo: true,
              topoImageCount: 1,
              ratingAvg: null,
              ratingCount: 0,
              weightedRating: null,
              sendCount: 0,
              recentSendCount60d: 0,
            },
          ],
        },
      },
    ]

    expect(buildShallowLocalCragClimbsFromQueries(queries, 'crag-1', '/gb/test-crag')).toEqual([])
  })
})
