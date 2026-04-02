import { describe, expect, it } from 'vitest'
import { compareGrades, filterAndSortCragRoutes, formatRouteTypeLabel, getAvailableDirections, getRouteTypeChips, getSearchModalResults, normalizeRouteType } from '@/features/crags/lib/crag-route-filters'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'

function createRoute(overrides: Partial<CragRoute> = {}): CragRoute {
  return {
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
  }
}

describe('crag route filters', () => {
  describe('compareGrades', () => {
    it('orders grades by difficulty', () => {
      expect(compareGrades('5A', '6A')).toBeLessThan(0)
      expect(compareGrades('6A', '6A')).toBe(0)
      expect(compareGrades('6A', '5A')).toBeGreaterThan(0)
    })

    it('handles unknown grades by falling back to localeCompare', () => {
      expect(compareGrades('Unknown', 'Unknown')).toBe(0)
    })
  })

  describe('normalizeRouteType', () => {
    it('normalizes route type strings', () => {
      expect(normalizeRouteType('  Slab  ')).toBe('slab')
      expect(normalizeRouteType('Overhang')).toBe('overhang')
      expect(normalizeRouteType('roof_type')).toBe('roof-type')
    })
  })

  describe('formatRouteTypeLabel', () => {
    it('formats route type labels with title case', () => {
      expect(formatRouteTypeLabel('slab')).toBe('Slab')
      expect(formatRouteTypeLabel('roof-type')).toBe('Roof Type')
    })
  })

  describe('getAvailableDirections', () => {
    it('returns sorted directions with Unknown last', () => {
      const routes = [
        createRoute({ id: '1', directions: ['S', 'E'] }),
        createRoute({ id: '2', directions: ['N'] }),
        createRoute({ id: '3', directions: [] }),
      ]

      const directions = getAvailableDirections(routes)
      expect(directions).toEqual(['N', 'E', 'S', 'Unknown'])
    })

    it('returns empty array when no routes', () => {
      expect(getAvailableDirections([])).toEqual([])
    })
  })

  describe('getRouteTypeChips', () => {
    it('returns unique sorted route types', () => {
      const routes = [
        createRoute({ id: '1', routeType: 'slab' }),
        createRoute({ id: '2', routeType: 'overhang' }),
        createRoute({ id: '3', routeType: 'slab' }),
        createRoute({ id: '4', routeType: null }),
      ]

      const chips = getRouteTypeChips(routes)
      expect(chips).toEqual(['overhang', 'slab'])
    })
  })

  describe('getSearchModalResults', () => {
    it('returns matching routes limited to 12', () => {
      const routes = [
        createRoute({ id: '1', name: 'Alpha' }),
        createRoute({ id: '2', name: 'Beta' }),
        createRoute({ id: '3', name: 'Gamma' }),
      ]

      const results = getSearchModalResults(routes, 'alpha')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alpha')
    })

    it('returns empty array for empty query', () => {
      const routes = [createRoute({ id: '1', name: 'Alpha' })]
      expect(getSearchModalResults(routes, '  ')).toEqual([])
    })
  })

  describe('filterAndSortCragRoutes', () => {
    const routes = [
      createRoute({ id: '1', name: 'Easy Slab', grade: '5A', sendCount: 20, weightedRating: 4.5, routeType: 'slab', directions: ['N'] }),
      createRoute({ id: '2', name: 'Hard Overhang', grade: '7A', sendCount: 5, weightedRating: 4.8, routeType: 'overhang', directions: ['S'] }),
      createRoute({ id: '3', name: 'Mid Route', grade: '6A', sendCount: 15, weightedRating: 4.0, routeType: 'slab', directions: ['E'] }),
      createRoute({ id: '4', name: 'No Topo', grade: '6A', sendCount: 8, weightedRating: 3.5, routeType: null, directions: [], hasTopo: false }),
    ]
    const highlightedRouteIds = new Set<string>()

    it('filters by min grade', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '6A',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(3)
      expect(filtered.every((r) => r.grade === '6A' || r.grade === '7A')).toBe(true)
    })

    it('filters by max grade', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '6A',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(3)
      expect(filtered.every((r) => r.grade === '5A' || r.grade === '6A')).toBe(true)
    })

    it('filters by direction', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: ['N'],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Easy Slab')
    })

    it('filters by route type', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: ['slab'],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(2)
      expect(filtered.every((r) => r.routeType === 'slab')).toBe(true)
    })

    it('filters by topo only', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: true,
      })

      expect(filtered).toHaveLength(3)
      expect(filtered.every((r) => r.hasTopo)).toBe(true)
    })

    it('filters by min rating', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '4.5',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(2)
    })

    it('filters by min sends', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '10',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(2)
    })

    it('filters by search query', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: 'easy',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Easy Slab')
    })

    it('filters by selected image (highlighted routes)', () => {
      const highlighted = new Set(['1', '3'])
      const filtered = filterAndSortCragRoutes(routes, highlighted, 'sends', {
        selectedImageId: 'image-1',
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered).toHaveLength(2)
      expect(filtered.every((r) => highlighted.has(r.id))).toBe(true)
    })

    it('sorts by sends descending', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered[0].sendCount).toBeGreaterThanOrEqual(filtered[1].sendCount)
      expect(filtered[0].name).toBe('Easy Slab')
    })

    it('sorts by grade ascending', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'grade', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered[0].grade).toBe('5A')
    })

    it('sorts by name ascending', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'name', {
        selectedImageId: null,
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered[0].name).toBe('Easy Slab')
      expect(filtered[filtered.length - 1].name).toBe('No Topo')
    })

    it('puts highlighted routes first when sorting', () => {
      const highlighted = new Set(['4'])
      const filtered = filterAndSortCragRoutes(routes, highlighted, 'sends', {
        selectedImageId: 'image-1',
        minGrade: '',
        maxGrade: '',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: [],
        topoOnly: false,
      })

      expect(filtered[0].id).toBe('4')
    })

    it('combines multiple filters', () => {
      const filtered = filterAndSortCragRoutes(routes, highlightedRouteIds, 'sends', {
        selectedImageId: null,
        minGrade: '6A',
        maxGrade: '6A',
        minRating: '',
        minSends: '',
        searchQuery: '',
        selectedDirections: [],
        selectedRouteTypes: ['slab'],
        topoOnly: true,
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Mid Route')
    })
  })
})
