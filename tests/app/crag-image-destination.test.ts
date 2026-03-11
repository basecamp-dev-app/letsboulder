import { describe, expect, test } from 'vitest'
import { buildCragImageDestination } from '@/app/crag/components/crag-image-destination'

describe('buildCragImageDestination', () => {
  test('preserves image and route params for slug routes', () => {
    expect(buildCragImageDestination({
      imageId: 'img-1',
      routeHrefBase: '/pt/cccc',
      offlineOnly: false,
      target: {
        climbId: 'climb-1',
        routeId: 'route-1',
        climbSlug: 'arete',
        imageId: 'img-1',
      },
    })).toBe('/pt/cccc/arete?image=img-1&route=route-1')
  })

  test('falls back to climb url when slug is unavailable', () => {
    expect(buildCragImageDestination({
      imageId: 'img-2',
      routeHrefBase: '/pt/cccc',
      offlineOnly: false,
      target: {
        climbId: 'climb-2',
        routeId: 'route-2',
        climbSlug: null,
        imageId: 'img-2',
      },
    })).toBe('/climb/climb-2?image=img-2&route=route-2')
  })

  test('falls back to image page when no route target exists', () => {
    expect(buildCragImageDestination({
      imageId: 'img-3',
      routeHrefBase: '/pt/cccc',
      offlineOnly: false,
    })).toBe('/image/img-3')
  })
})
