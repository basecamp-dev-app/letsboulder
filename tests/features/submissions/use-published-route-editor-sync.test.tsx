import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePublishedRouteEditorSync } from '@/features/submissions/submission-editor/hooks/use-published-route-editor-sync'
import type { RouteLine } from '@/types/domain'

function createMockStore(routes: RouteLine[] = []) {
  return {
    routes,
    setRoutes: vi.fn(),
    setSelectedRoute: vi.fn(),
    setActiveRoute: vi.fn(),
    setEditorPanelOpen: vi.fn(),
    clearCanvasState: vi.fn(),
  }
}

let mockStore = createMockStore()

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: ReturnType<typeof createMockStore>) => T) => selector(mockStore),
}))

function createRoute(id: string, imageId: string): RouteLine {
  return {
    id,
    image_id: imageId,
    climb_id: `climb-${id}`,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.7, y: 0.7 },
    ],
    color: 'red',
    sequence_order: 0,
    created_at: '2026-04-05T00:00:00.000Z',
    image_width: 1200,
    image_height: 900,
    climb: {
      id: `climb-${id}`,
      name: id,
      grade: '6A',
      status: 'approved',
      route_type: 'boulder',
      description: null,
    },
  }
}

function TestHarness(props: {
  activeImageId: string | null
  editedRoutes: RouteLine[]
  setEditedRoutes: (routes: RouteLine[]) => void
}) {
  usePublishedRouteEditorSync(props)
  return null
}

describe('usePublishedRouteEditorSync', () => {
  afterEach(() => {
    mockStore = createMockStore()
  })

  it('seeds the store and clears selection on image switch', () => {
    const setEditedRoutes = vi.fn()
    const imageOneRoutes = [createRoute('route-1', 'image-1')]
    const imageTwoRoutes = [createRoute('route-2', 'image-2')]
    const { rerender } = render(
      <TestHarness activeImageId="image-1" editedRoutes={imageOneRoutes} setEditedRoutes={setEditedRoutes} />
    )

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
    expect(mockStore.setRoutes).toHaveBeenCalledWith(imageOneRoutes)

    rerender(<TestHarness activeImageId="image-2" editedRoutes={imageTwoRoutes} setEditedRoutes={setEditedRoutes} />)

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(2)
    expect(mockStore.setRoutes).toHaveBeenLastCalledWith(imageTwoRoutes)
    expect(mockStore.setSelectedRoute).toHaveBeenLastCalledWith(null)
    expect(mockStore.setActiveRoute).toHaveBeenLastCalledWith(null)
    expect(mockStore.setEditorPanelOpen).toHaveBeenLastCalledWith(false)
  })

  it('does not reseed the store when owner routes already match', () => {
    const routes = [createRoute('route-1', 'image-1')]
    mockStore = createMockStore(routes)

    render(<TestHarness activeImageId="image-1" editedRoutes={routes} setEditedRoutes={vi.fn()} />)

    expect(mockStore.setRoutes).toHaveBeenCalledTimes(1)
  })

  it('syncs store edits back to the page state', () => {
    const setEditedRoutes = vi.fn()
    const originalRoute = createRoute('route-1', 'image-1')
    const originalClimb = originalRoute.climb!
    const updatedRoute: RouteLine = {
      ...originalRoute,
      climb: {
        id: originalClimb.id,
        name: 'Updated route',
        grade: originalClimb.grade,
        status: originalClimb.status,
        route_type: originalClimb.route_type,
        description: originalClimb.description,
      },
    }

    mockStore = createMockStore([originalRoute])

    const { rerender } = render(
      <TestHarness activeImageId="image-1" editedRoutes={[originalRoute]} setEditedRoutes={setEditedRoutes} />
    )

    mockStore = createMockStore([updatedRoute])

    rerender(<TestHarness activeImageId="image-1" editedRoutes={[originalRoute]} setEditedRoutes={setEditedRoutes} />)

    expect(setEditedRoutes).toHaveBeenLastCalledWith([updatedRoute])
  })

  it('reseeds the store when routes load after mount for the same image', () => {
    const setEditedRoutes = vi.fn()
    const loadedRoutes = [createRoute('route-1', 'image-1')]

    mockStore = createMockStore([])

    const { rerender } = render(
      <TestHarness activeImageId="image-1" editedRoutes={[]} setEditedRoutes={setEditedRoutes} />
    )

    rerender(<TestHarness activeImageId="image-1" editedRoutes={loadedRoutes} setEditedRoutes={setEditedRoutes} />)

    expect(mockStore.setRoutes).toHaveBeenLastCalledWith(loadedRoutes)
  })
})
