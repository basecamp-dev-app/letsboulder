import { describe, expect, test } from 'vitest'
import { buildCragImageDestination } from '@/features/crags/lib/build-crag-image-destination'

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
    })).toBe('/pt/cccc/i/img-1?image=img-1&route=route-1&climb=climb-1')
  })

  test('preserves UUID route params for image-first navigation', () => {
    expect(buildCragImageDestination({
      imageId: 'img-uuid',
      routeHrefBase: '/mx/el-nuevo-testamento',
      offlineOnly: false,
      target: {
        climbId: '06dd93bf-66d2-4e3e-a632-586e83b5ff83',
        routeId: 'a2fac2e6-2459-47d6-93ad-741e80f49caa',
        climbSlug: 'omega',
        imageId: 'd05a1dcc-3380-4f4a-85e0-9f19aada2ecd',
      },
    })).toBe('/mx/el-nuevo-testamento/i/img-uuid?image=d05a1dcc-3380-4f4a-85e0-9f19aada2ecd&route=a2fac2e6-2459-47d6-93ad-741e80f49caa&climb=06dd93bf-66d2-4e3e-a632-586e83b5ff83')
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
    })).toBe('/image/img-2?image=img-2&route=route-2&climb=climb-2')
  })

  test('falls back to climb url offline when slug is unavailable', () => {
    expect(buildCragImageDestination({
      imageId: 'img-2',
      routeHrefBase: '/pt/cccc',
      offlineOnly: true,
      target: {
        climbId: 'climb-2',
        routeId: 'route-2',
        climbSlug: null,
        imageId: 'img-2',
      },
    })).toBe('/climb/climb-2?image=img-2&route=route-2&climb=climb-2')
  })

  test('falls back to image page when no route target exists', () => {
    expect(buildCragImageDestination({
      imageId: 'img-3',
      routeHrefBase: '/pt/cccc',
      offlineOnly: false,
    })).toBe('/image/img-3')
  })
})
