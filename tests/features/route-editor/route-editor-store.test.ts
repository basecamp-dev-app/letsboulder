import { afterEach, describe, expect, test } from 'vitest'
import { useRouteStore } from '@/features/route-editor/store'
import type { RouteLine } from '@/types/domain'

const createRoute = (id: string): RouteLine => ({
  id,
  image_id: 'image-1',
  climb_id: `climb-${id}`,
  points: [],
  color: '#000000',
  sequence_order: 0,
  created_at: '2026-07-24T00:00:00.000Z',
  climb: {
    id: `climb-${id}`,
    name: `Route ${id}`,
    grade: '6A',
    status: 'pending',
    route_type: 'boulder',
    description: 'Original description',
  },
})

describe('route editor store', () => {
  afterEach(() => {
    useRouteStore.getState().reset()
  })

  test('updates route metadata before switching routes clears the draft', () => {
    const firstRoute = createRoute('route-1')
    const secondRoute = createRoute('route-2')

    useRouteStore.setState({
      routes: [firstRoute, secondRoute],
      selectedRouteId: firstRoute.id,
      routeEditorDraft: {
        routeId: firstRoute.id,
        name: firstRoute.climb?.name ?? '',
        grade: firstRoute.climb?.grade ?? '',
        climbType: 'boulder',
        description: firstRoute.climb?.description ?? '',
      },
    })

    useRouteStore.getState().updateEditorDraft({
      name: 'Immediate name',
      grade: '7A',
      climbType: 'sport',
      description: 'Immediate description',
    })
    useRouteStore.getState().setSelectedRoute(secondRoute.id)

    const state = useRouteStore.getState()
    expect(state.routeEditorDraft).toBeNull()
    expect(state.routes[0]?.climb).toEqual({
      ...firstRoute.climb,
      name: 'Immediate name',
      grade: '7A',
      route_type: 'sport',
      description: 'Immediate description',
    })
    expect(state.routes[1]).toBe(secondRoute)
  })

  test('does nothing when there is no editor draft', () => {
    const route = createRoute('route-1')
    useRouteStore.setState({ routes: [route], routeEditorDraft: null })

    useRouteStore.getState().updateEditorDraft({ name: 'Ignored name' })

    expect(useRouteStore.getState().routes[0]).toBe(route)
    expect(useRouteStore.getState().routeEditorDraft).toBeNull()
  })
})
