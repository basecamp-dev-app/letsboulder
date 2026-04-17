// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditDraftRouteStoreSync } from '@/features/draft-editor/hooks/use-edit-draft-route-store-sync'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'
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
  useRouteStore: () => mockStore,
}))

function createRoute(id: string, imageId: string, name = id): RouteLine {
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
      name,
      grade: '6A',
      status: 'approved',
      route_type: 'boulder',
      description: null,
    },
  }
}

function createDraftRoute(id: string, name = id): DraftRoute {
  return {
    id,
    name,
    grade: '6A',
    description: undefined,
    climbType: 'boulder',
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.7, y: 0.7 },
    ],
    sequenceOrder: 0,
    imageWidth: 1200,
    imageHeight: 900,
  }
}

function TestHarness(props: {
  activeDraftImageId: string | null
  existingRouteLines: RouteLine[]
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  routeType: string
  markRoutesDirty: (imageIds: string[]) => void
}) {
  useEditDraftRouteStoreSync(props)
  return null
}

describe('useEditDraftRouteStoreSync', () => {
  afterEach(() => {
    mockStore = createMockStore()
  })

  it('seeds the store and clears selection on image switch', () => {
    const setRoutesByImageId = vi.fn()
    const markRoutesDirty = vi.fn()
    const imageOneRoutes = [createRoute('route-1', 'image-1')]
    const imageTwoRoutes = [createRoute('route-2', 'image-2')]

    const { rerender } = render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: imageOneRoutes,
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
    expect(mockStore.setRoutes).toHaveBeenCalledWith(imageOneRoutes)

    rerender(React.createElement(TestHarness, {
      activeDraftImageId: 'image-2',
      existingRouteLines: imageTwoRoutes,
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(2)
    expect(mockStore.setRoutes).toHaveBeenLastCalledWith(imageTwoRoutes)
    expect(mockStore.setSelectedRoute).toHaveBeenLastCalledWith(null)
    expect(mockStore.setActiveRoute).toHaveBeenLastCalledWith(null)
    expect(mockStore.setEditorPanelOpen).toHaveBeenLastCalledWith(false)
  })

  it('reseeds when routes load later for the same image', () => {
    const setRoutesByImageId = vi.fn()
    const markRoutesDirty = vi.fn()
    const loadedRoutes = [createRoute('route-1', 'image-1')]

    mockStore = createMockStore([])

    const { rerender } = render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    rerender(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: loadedRoutes,
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(mockStore.setRoutes).toHaveBeenLastCalledWith(loadedRoutes)
  })

  it('syncs store edits back to routesByImageId', () => {
    const markRoutesDirty = vi.fn()
    const originalRoute = createRoute('route-1', 'image-1')
    const updatedRoute = createRoute('route-1', 'image-1', 'Updated route')
    const state = { 'image-1': [createDraftRoute('route-1')] }
    const setRoutesByImageId = vi.fn((updater: React.SetStateAction<Record<string, DraftRoute[]>>) => {
      if (typeof updater === 'function') {
        return updater(state)
      }
      return updater
    })

    mockStore = createMockStore([originalRoute])

    const { rerender } = render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [originalRoute],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    mockStore = createMockStore([updatedRoute])

    rerender(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [originalRoute],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(setRoutesByImageId).toHaveBeenCalled()
    expect(markRoutesDirty).toHaveBeenCalledWith(['image-1'])
  })

  it('does not sync owner state when store and parent signatures match', () => {
    const route = createRoute('route-1', 'image-1')
    const setRoutesByImageId = vi.fn()
    const markRoutesDirty = vi.fn()

    mockStore = createMockStore([route])

    render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [route],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(markRoutesDirty).not.toHaveBeenCalled()
  })

  it('does not write owner route state for selection-only rerenders', () => {
    const route = createRoute('route-1', 'image-1')
    const setRoutesByImageId = vi.fn()
    const markRoutesDirty = vi.fn()

    mockStore = createMockStore([route])

    const { rerender } = render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [route],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    rerender(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [createRoute('route-1', 'image-1')],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(setRoutesByImageId).not.toHaveBeenCalled()
    expect(markRoutesDirty).not.toHaveBeenCalled()
    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
  })

  it('reseeds same-image external route changes without resetting canvas UI state', () => {
    const originalRoute = createRoute('route-1', 'image-1')
    const renamedRoute = createRoute('route-1', 'image-1', 'Renamed externally')
    const setRoutesByImageId = vi.fn()
    const markRoutesDirty = vi.fn()

    mockStore = createMockStore([originalRoute])

    const { rerender } = render(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [originalRoute],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
    expect(mockStore.setRoutes).toHaveBeenCalledTimes(1)

    rerender(React.createElement(TestHarness, {
      activeDraftImageId: 'image-1',
      existingRouteLines: [renamedRoute],
      setRoutesByImageId,
      routeType: 'boulder',
      markRoutesDirty,
    }))

    expect(mockStore.setRoutes).toHaveBeenCalledTimes(2)
    expect(mockStore.setRoutes).toHaveBeenLastCalledWith([renamedRoute])
    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
    expect(mockStore.setSelectedRoute).toHaveBeenCalledTimes(1)
    expect(mockStore.setActiveRoute).toHaveBeenCalledTimes(1)
    expect(mockStore.setEditorPanelOpen).toHaveBeenCalledTimes(1)
  })
})
