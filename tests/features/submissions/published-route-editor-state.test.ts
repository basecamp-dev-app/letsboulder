import { describe, expect, test } from 'vitest'
import {
  haveRouteEdits,
  normalizePublishedRoute,
  removePublishedRoute,
  replaceDraftRoutesWithPublishedRoutes,
} from '@/features/submissions/submission-editor/lib/published-route-editor-state'
import type { RouteLine } from '@/types/domain'

function createRoute(overrides: Partial<RouteLine> = {}): RouteLine {
  return {
    id: 'route-1',
    image_id: 'image-1',
    climb_id: 'climb-1',
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.6 },
    ],
    color: 'red',
    sequence_order: 0,
    created_at: '2026-04-05T00:00:00.000Z',
    image_width: 1200,
    image_height: 900,
    climb: {
      id: 'climb-1',
      name: 'Warm Up',
      grade: '6A',
      status: 'approved',
      route_type: 'boulder',
      description: null,
    },
    ...overrides,
  }
}

describe('published-route-editor-state', () => {
  test('normalizes a created route payload into RouteLine', () => {
    const route = normalizePublishedRoute({
      id: 'route-2',
      climb_id: 'climb-2',
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.8 },
      ],
      sequence_order: 1,
      image_width: 1500,
      image_height: 1000,
      climbs: {
        id: 'climb-2',
        name: 'Second Go',
        grade: '6B',
        status: 'approved',
        route_type: 'boulder',
        description: 'Freshly saved',
      },
    }, 'image-1')

    expect(route).toMatchObject({
      id: 'route-2',
      image_id: 'image-1',
      climb_id: 'climb-2',
      sequence_order: 1,
      climb: {
        id: 'climb-2',
        name: 'Second Go',
        grade: '6B',
      },
    })
  })

  test('replaces draft-created routes with saved published routes', () => {
    const existingRoute = createRoute()
    const draftRoute = createRoute({
      id: 'draft-route',
      climb_id: '',
      created_at: 'draft-created',
      sequence_order: 1,
      climb: {
        id: '',
        name: 'Unsaved',
        grade: '6A+',
        status: 'draft',
        route_type: 'boulder',
        description: null,
      },
    })
    const savedRoute = createRoute({
      id: 'route-2',
      climb_id: 'climb-2',
      sequence_order: 1,
      climb: {
        id: 'climb-2',
        name: 'Saved',
        grade: '6A+',
        status: 'approved',
        route_type: 'boulder',
        description: null,
      },
    })

    expect(replaceDraftRoutesWithPublishedRoutes([existingRoute, draftRoute], [savedRoute])).toEqual([
      existingRoute,
      savedRoute,
    ])
  })

  test('removes a route and resequences the remaining list', () => {
    const routes = [
      createRoute({ id: 'route-1', sequence_order: 0 }),
      createRoute({ id: 'route-2', climb_id: 'climb-2', sequence_order: 1 }),
      createRoute({ id: 'route-3', climb_id: 'climb-3', sequence_order: 2 }),
    ]

    expect(removePublishedRoute(routes, 'route-2')).toEqual([
      routes[0],
      { ...routes[2], sequence_order: 1 },
    ])
  })

  test('detects route edits from serialized route state', () => {
    const initial = [createRoute()]
    const edited = [createRoute({ climb: { ...createRoute().climb!, name: 'Renamed' } })]

    expect(haveRouteEdits(initial, initial)).toBe(false)
    expect(haveRouteEdits(edited, initial)).toBe(true)
  })
})
