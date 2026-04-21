import { describe, expect, it } from 'vitest'
import { buildCragImageDestination } from '@/features/crags/lib/build-crag-image-destination'
import { formatCragRoutes, dedupeCragRoutes } from '@/features/crags/lib/crag-page-domain'
import { getSelectedImageIds } from '@/features/crags/lib/crag-route-targets'
import type { CragRouteIntelligenceRow } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'

function createIntelligenceRow(overrides: Partial<CragRouteIntelligenceRow> = {}): CragRouteIntelligenceRow {
  return {
    id: 'climb-1',
    name: 'Test Route',
    grade: '6A',
    slug: 'test-route',
    route_type: 'slab',
    directions: ['N'],
    has_topo: true,
    topo_image_count: 1,
    rating_avg: 4.0,
    rating_count: 5,
    weighted_rating: 4.2,
    send_count: 10,
    recent_send_count_60d: 3,
    ...overrides,
  } as CragRouteIntelligenceRow
}

describe('crag page domain', () => {
  describe('formatCragRoutes', () => {
    it('formats intelligence rows into CragRoute objects', () => {
      const rows = [
        createIntelligenceRow({ id: '1', name: 'Route A', grade: '5A' }),
        createIntelligenceRow({ id: '2', name: 'Route B', grade: '6A' }),
      ]

      const routes = formatCragRoutes(rows)

      expect(routes).toHaveLength(2)
      expect(routes[0]).toMatchObject({
        id: '1',
        name: 'Route A',
        grade: '5A',
        routeType: 'slab',
        hasTopo: true,
        sendCount: 10,
      })
    })

    it('handles null/undefined rows', () => {
      expect(formatCragRoutes(null)).toEqual([])
      expect(formatCragRoutes(undefined)).toEqual([])
      expect(formatCragRoutes([])).toEqual([])
    })

    it('defaults unnamed routes to "Unnamed route"', () => {
      const rows = [createIntelligenceRow({ name: '' })]
      const routes = formatCragRoutes(rows)
      expect(routes[0].name).toBe('Unnamed route')
    })

    it('normalizes null numeric fields', () => {
      const rows = [createIntelligenceRow({
        rating_avg: null as unknown as number,
        rating_count: null as unknown as number,
        weighted_rating: null as unknown as number,
        send_count: null as unknown as number,
        recent_send_count_60d: null as unknown as number,
      })]

      const routes = formatCragRoutes(rows)

      expect(routes[0].ratingAvg).toBe(null)
      expect(routes[0].ratingCount).toBe(0)
      expect(routes[0].weightedRating).toBe(null)
      expect(routes[0].sendCount).toBe(0)
      expect(routes[0].recentSendCount60d).toBe(0)
    })
  })

  describe('dedupeCragRoutes', () => {
    const createRoute = (overrides: Partial<CragRoute> = {}): CragRoute => ({
      id: 'route-1',
      name: 'Test Route',
      grade: '6A',
      slug: 'test-route',
      routeType: 'slab',
      directions: ['N'],
      hasTopo: true,
      topoImageCount: 1,
      ratingAvg: 4.0,
      ratingCount: 5,
      weightedRating: 4.2,
      sendCount: 10,
      recentSendCount60d: 3,
      ...overrides,
    })

    it('deduplicates routes by effective climb id', () => {
      const routes = [
        createRoute({ id: '1', name: 'Route A' }),
        createRoute({ id: '2', name: 'Route B' }),
      ]
      const effectiveClimbIdByClimbId = { '2': '1' }

      const deduped = dedupeCragRoutes(routes, effectiveClimbIdByClimbId)

      expect(deduped).toHaveLength(1)
      expect(deduped[0].id).toBe('1')
    })

    it('preserves canonical route name when deduplicating', () => {
      const routes = [
        createRoute({ id: '1', name: 'Canonical Name' }),
        createRoute({ id: '2', name: 'Alias Name' }),
      ]
      const effectiveClimbIdByClimbId = { '2': '1' }

      const deduped = dedupeCragRoutes(routes, effectiveClimbIdByClimbId)

      expect(deduped[0].name).toBe('Canonical Name')
    })

    it('merges directions from duplicate routes', () => {
      const routes = [
        createRoute({ id: '1', directions: ['N'] }),
        createRoute({ id: '2', directions: ['S'] }),
      ]
      const effectiveClimbIdByClimbId = { '2': '1' }

      const deduped = dedupeCragRoutes(routes, effectiveClimbIdByClimbId)

      expect(deduped[0].directions).toContain('N')
      expect(deduped[0].directions).toContain('S')
    })

    it('keeps max values for numeric fields', () => {
      const routes = [
        createRoute({ id: '1', sendCount: 10, ratingCount: 5 }),
        createRoute({ id: '2', sendCount: 20, ratingCount: 3 }),
      ]
      const effectiveClimbIdByClimbId = { '2': '1' }

      const deduped = dedupeCragRoutes(routes, effectiveClimbIdByClimbId)

      expect(deduped[0].sendCount).toBe(20)
      expect(deduped[0].ratingCount).toBe(5)
    })

    it('handles routes without effective climb id mapping', () => {
      const routes = [
        createRoute({ id: '1' }),
        createRoute({ id: '2' }),
      ]
      const effectiveClimbIdByClimbId = {}

      const deduped = dedupeCragRoutes(routes, effectiveClimbIdByClimbId)

      expect(deduped).toHaveLength(2)
    })
  })

  describe('getSelectedImageIds', () => {
    it('returns all images that share the same normalized gps location', () => {
      const selectedImageIds = getSelectedImageIds('image-2', {
        clusterIdByImageId: new Map([
          ['image-1', '51.000000:0.100000'],
          ['image-2', '51.000000:0.100000'],
          ['image-3', '51.000100:0.100200'],
        ]),
        clusterById: new Map([
          ['51.000000:0.100000', {
            id: '51.000000:0.100000',
            images: [{ id: 'image-1' }, { id: 'image-2' }],
          }],
          ['51.000100:0.100200', {
            id: '51.000100:0.100200',
            images: [{ id: 'image-3' }],
          }],
        ]),
        clusters: [
          {
            id: '51.000000:0.100000',
            images: [{ id: 'image-1' }, { id: 'image-2' }],
          },
          {
            id: '51.000100:0.100200',
            images: [{ id: 'image-3' }],
          },
        ],
      })

      expect(selectedImageIds).toEqual(new Set(['image-1', 'image-2']))
    })
  })

  describe('buildCragImageDestination', () => {
    it('falls back to the image-first page when an image has no route target', () => {
      expect(buildCragImageDestination({
        imageId: 'image-7',
        target: undefined,
        routeHrefBase: '/gb/test-crag',
        offlineOnly: false,
      })).toBe('/gb/test-crag/i/image-7')
    })

    it('includes route params when an image has a route target', () => {
      expect(buildCragImageDestination({
        imageId: 'image-7',
        target: {
          climbId: 'climb-1',
          routeId: 'route-line-1',
          climbSlug: 'route-a',
          imageId: 'image-7',
        },
        routeHrefBase: '/gb/test-crag',
        offlineOnly: false,
      })).toBe('/gb/test-crag/i/image-7?image=image-7&route=route-line-1&climb=climb-1')
    })
  })
})
