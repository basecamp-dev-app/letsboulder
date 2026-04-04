import { describe, expect, test } from 'vitest'
import {
  parseRoutePoints,
  areRoutePointsEqual,
  serializeRouteEditorRoute,
  areSerializedRoutesEqual,
  buildRouteCompletionPayload,
  parseSerializedRouteData,
  type RouteSerializerInput,
  type RouteEditorSerializableRoute,
} from '@/features/route-editor/route-editor-utils'
import type { RoutePoint } from '@/types/climbing'

describe('parseRoutePoints', () => {
  test('returns empty array for null/undefined', () => {
    expect(parseRoutePoints(null)).toEqual([])
    expect(parseRoutePoints(undefined)).toEqual([])
  })

  test('filters invalid points', () => {
    const input = [
      { x: 0.5, y: 0.5 },
      { x: 'invalid' as unknown as number, y: 0.5 },
      { x: 0.5, y: null },
      { x: 0.5, y: 0.75 },
    ] as unknown as RoutePoint[]
    expect(parseRoutePoints(input)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.75 },
    ])
  })

  test('parses JSON string', () => {
    const input = '[{"x":0.5,"y":0.5},{"x":0.6,"y":0.6}]'
    expect(parseRoutePoints(input)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.6 },
    ])
  })

  test('returns empty for invalid JSON string', () => {
    expect(parseRoutePoints('invalid json')).toEqual([])
  })

  test('handles empty array', () => {
    expect(parseRoutePoints([])).toEqual([])
  })
})

describe('areRoutePointsEqual', () => {
  test('identical arrays return true', () => {
    const a = [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }]
    const b = [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }]
    expect(areRoutePointsEqual(a, b)).toBe(true)
  })

  test('different lengths return false', () => {
    const a = [{ x: 0.5, y: 0.5 }]
    const b = [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }]
    expect(areRoutePointsEqual(a, b)).toBe(false)
  })

  test('different values return false', () => {
    const a = [{ x: 0.5, y: 0.5 }]
    const b = [{ x: 0.6, y: 0.6 }]
    expect(areRoutePointsEqual(a, b)).toBe(false)
  })

  test('same reference returns true', () => {
    const arr = [{ x: 0.5, y: 0.5 }]
    expect(areRoutePointsEqual(arr, arr)).toBe(true)
  })
})

describe('serializeRouteEditorRoute', () => {
  test('applies defaults for missing values', () => {
    const result = serializeRouteEditorRoute({
      id: 'route-1',
      name: null,
      grade: null,
      points: [{ x: 0.5, y: 0.5 }],
      sequenceOrder: 0,
    })
    expect(result.name).toBe('Unnamed')
    expect(result.grade).toBe('6A')
    expect(result.imageWidth).toBe(1200)
    expect(result.imageHeight).toBe(1200)
  })

  test('trims whitespace from name and grade', () => {
    const result = serializeRouteEditorRoute({
      id: 'route-1',
      name: '  Test Route  ',
      grade: '  6A  ',
      points: [],
      sequenceOrder: 0,
    })
    expect(result.name).toBe('Test Route')
    expect(result.grade).toBe('6A')
  })

  test('handles description and climbType', () => {
    const result = serializeRouteEditorRoute({
      id: 'route-1',
      name: 'Test',
      grade: '6A',
      description: 'Test description',
      climbType: 'sport',
      points: [],
      sequenceOrder: 0,
    })
    expect(result.description).toBe('Test description')
    expect(result.climbType).toBe('sport')
  })

  test('uses fallback dimensions', () => {
    const result = serializeRouteEditorRoute(
      { id: 'route-1', name: 'Test', grade: '6A', points: [], sequenceOrder: 0 },
      1920,
      1080
    )
    expect(result.imageWidth).toBe(1920)
    expect(result.imageHeight).toBe(1080)
  })
})

describe('areSerializedRoutesEqual', () => {
  test('identical routes return true', () => {
    const a = [
      { id: 'r1', name: 'Route 1', grade: '6A', points: [{ x: 0.5, y: 0.5 }], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 },
    ]
    const b = [
      { id: 'r1', name: 'Route 1', grade: '6A', points: [{ x: 0.5, y: 0.5 }], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 },
    ]
    expect(areSerializedRoutesEqual(a, b)).toBe(true)
  })

  test('different names return false', () => {
    const a = [{ id: 'r1', name: 'Route 1', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }]
    const b = [{ id: 'r1', name: 'Route 2', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }] as typeof a
    expect(areSerializedRoutesEqual(a, b)).toBe(false)
  })

  test('different lengths return false', () => {
    const a = [{ id: 'r1', name: 'Route 1', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }]
    const b: typeof a = []
    expect(areSerializedRoutesEqual(a, b)).toBe(false)
  })

  test('treats undefined description as empty string', () => {
    const a: RouteEditorSerializableRoute[] = [{ id: 'r1', name: 'Route', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }]
    const b: RouteEditorSerializableRoute[] = [{ id: 'r1', name: 'Route', grade: '6A', description: 'desc', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }]
    expect(areSerializedRoutesEqual(a, b)).toBe(false)
  })
})

describe('buildRouteCompletionPayload', () => {
  test('orders images by orderedImageIds', () => {
    const images = [
      { id: 'img-1', display_order: 0, route_data: null, width: 1200, height: 1200 },
      { id: 'img-2', display_order: 1, route_data: null, width: 1200, height: 1200 },
      { id: 'img-3', display_order: 2, route_data: null, width: 1200, height: 1200 },
    ]
    const routesByImageId: Record<string, RouteSerializerInput[]> = {
      'img-1': [{ id: 'r1', name: 'Route 1', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }],
      'img-2': [{ id: 'r2', name: 'Route 2', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }],
    }

    const result = buildRouteCompletionPayload(images, routesByImageId, 'sport', ['img-3', 'img-1', 'img-2'])

    expect(result[0].id).toBe('img-3')
    expect(result[1].id).toBe('img-1')
    expect(result[2].id).toBe('img-2')
  })

  test('uses display_order when no orderedImageIds', () => {
    const images = [
      { id: 'img-1', display_order: 2, route_data: null, width: 1200, height: 1200 },
      { id: 'img-2', display_order: 0, route_data: null, width: 1200, height: 1200 },
      { id: 'img-3', display_order: 1, route_data: null, width: 1200, height: 1200 },
    ]

    const result = buildRouteCompletionPayload(images, {}, 'sport')

    expect(result[0].id).toBe('img-2')
    expect(result[1].id).toBe('img-3')
    expect(result[2].id).toBe('img-1')
  })

  test('applies routeType as climbType fallback', () => {
    const images = [{ id: 'img-1', display_order: 0, route_data: {}, width: 1200, height: 1200 }]
    const routesByImageId: Record<string, RouteSerializerInput[]> = {
      'img-1': [{ id: 'r1', name: 'Route 1', grade: '6A', points: [], sequenceOrder: 0, imageWidth: 1200, imageHeight: 1200 }],
    }

    const result = buildRouteCompletionPayload(images, routesByImageId, 'boulder')

    const routeData = result[0].route_data.completedRoutes as unknown as Array<{ climbType?: string }>
    expect(routeData[0].climbType).toBe('boulder')
  })
})

describe('parseSerializedRouteData', () => {
  test('returns empty array for null route_data', () => {
    expect(parseSerializedRouteData(null, 1200, 1200)).toEqual([])
  })

  test('filters routes with less than 2 points', () => {
    const routeData = {
      completedRoutes: [
        { id: 'r1', name: 'Route 1', grade: '6A', points: [{ x: 0.5 }], sequenceOrder: 0 },
        { id: 'r2', name: 'Route 2', grade: '6A', points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }], sequenceOrder: 1 },
      ],
    }

    const result = parseSerializedRouteData(routeData as unknown as Record<string, unknown>, 1200, 1200)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r2')
  })

  test('applies fallback grade and name', () => {
    const routeData = {
      completedRoutes: [
        { points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }], sequenceOrder: 0 },
      ],
    }

    const result = parseSerializedRouteData(routeData as unknown as Record<string, unknown>, 1200, 1200)
    expect(result[0].name).toBe('Route 1')
    expect(result[0].grade).toBe('6A')
  })

  test('handles JSON string points', () => {
    const routeData = {
      completedRoutes: [
        { id: 'r1', name: 'Route', grade: '6A', points: '[{"x":0.5,"y":0.5}]', sequenceOrder: 0 },
      ],
    }

    const result = parseSerializedRouteData(routeData as unknown as Record<string, unknown>, 1200, 1200)
    expect(result).toHaveLength(0)
  })
})
