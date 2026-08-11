// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditDraftRouteStoreSync } from '@/features/draft-editor/hooks/use-edit-draft-route-store-sync'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'
import type { RouteLine } from '@/types/domain'

function createMockStore(routes: RouteLine[] = []) {
  return { routes, setRoutes: vi.fn(), setSelectedRoute: vi.fn(), setActiveRoute: vi.fn(), setEditorPanelOpen: vi.fn(), clearCanvasState: vi.fn() }
}

let mockStore = createMockStore()

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: ReturnType<typeof createMockStore>) => T) => selector(mockStore),
}))

function createRoute(id: string, name = id): RouteLine {
  return { id, image_id: 'image-1', climb_id: `climb-${id}`, points: [{ x: 0.1, y: 0.1 }, { x: 0.7, y: 0.7 }], color: 'red', sequence_order: 0, created_at: '2026-04-05T00:00:00.000Z', image_width: 1200, image_height: 900, climb: { id: `climb-${id}`, name, grade: '6A', status: 'approved', route_type: 'boulder', description: null } }
}

function TestHarness({ onCommit, onLiveRouteChanges, onMetadataUpdate, ...props }: { activeDraftImageId: string | null; existingRouteLines: RouteLine[]; routesByImageId: Record<string, DraftRoute[]>; setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>; routeType: string; routesHydrationRevision?: number; onCommit?: (commit: () => unknown) => void; onLiveRouteChanges?: (value: boolean) => void; onMetadataUpdate?: (update: (routeId: string, updates: { name?: string }) => void) => void }) {
  const { commitRoutes, hasLiveRouteChanges, updateRouteMetadata } = useEditDraftRouteStoreSync(props)
  onCommit?.(commitRoutes)
  onLiveRouteChanges?.(hasLiveRouteChanges)
  onMetadataUpdate?.(updateRouteMetadata)
  return null
}

describe('useEditDraftRouteStoreSync', () => {
  afterEach(() => { mockStore = createMockStore() })

  it('seeds the store and clears canvas UI on image switch or durable draft reload', () => {
    const firstRoutes = [createRoute('route-1')]
    const secondRoutes = [createRoute('route-2')]
    const props = { activeDraftImageId: 'image-1', existingRouteLines: firstRoutes, routesByImageId: {}, setRoutesByImageId: vi.fn(), routeType: 'boulder', routesHydrationRevision: 1 }
    const { rerender } = render(<TestHarness {...props} />)
    rerender(<TestHarness {...props} existingRouteLines={secondRoutes} routesHydrationRevision={2} />)
    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(2)
    expect(mockStore.setRoutes).toHaveBeenLastCalledWith(secondRoutes)
    expect(mockStore.setSelectedRoute).toHaveBeenLastCalledWith(null)
  })

  it('preserves newly drawn geometry when image reorder changes draft metadata', () => {
    const durableRoutes = [createRoute('route-1')]
    const drawnRoutes = [createRoute('route-2')]
    const props = { activeDraftImageId: 'image-1', existingRouteLines: durableRoutes, routesByImageId: {}, setRoutesByImageId: vi.fn(), routeType: 'boulder', routesHydrationRevision: 1 }
    const { rerender } = render(<TestHarness {...props} />)

    mockStore = { ...mockStore, routes: drawnRoutes }
    rerender(<TestHarness {...props} />)

    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(1)
    expect(mockStore.setRoutes).toHaveBeenCalledTimes(1)
    expect(mockStore.setRoutes).toHaveBeenCalledWith(durableRoutes)
  })

  it('commits transient store edits only when requested', () => {
    const setRoutesByImageId = vi.fn((updater: React.SetStateAction<Record<string, DraftRoute[]>>) => typeof updater === 'function' ? updater({ 'image-1': [] }) : updater)
    let commitRoutes: (() => unknown) | undefined
    mockStore = createMockStore([createRoute('route-1', 'Updated route')])
    render(<TestHarness activeDraftImageId="image-1" existingRouteLines={[]} routesByImageId={{ 'image-1': [] }} setRoutesByImageId={setRoutesByImageId} routeType="boulder" onCommit={(commit) => { commitRoutes = commit }} />)
    expect(setRoutesByImageId).not.toHaveBeenCalled()
    commitRoutes?.()
    expect(setRoutesByImageId).toHaveBeenCalledTimes(1)
  })

  it('reports live canvas geometry as dirty before navigating away', () => {
    const onLiveRouteChanges = vi.fn()
    mockStore = createMockStore([createRoute('route-1', 'Drawn route')])
    const props = { activeDraftImageId: 'image-1', existingRouteLines: [], routesByImageId: { 'image-1': [] }, setRoutesByImageId: vi.fn(), routeType: 'boulder', onLiveRouteChanges }
    const { rerender } = render(<TestHarness {...props} />)
    rerender(<TestHarness {...props} />)
    expect(onLiveRouteChanges).toHaveBeenLastCalledWith(true)
  })

  it('commits a newly drawn route before updating its metadata', () => {
    let routesByImageId: Record<string, DraftRoute[]> = { 'image-1': [] }
    const setRoutesByImageId = vi.fn((update: React.SetStateAction<Record<string, DraftRoute[]>>) => {
      routesByImageId = typeof update === 'function' ? update(routesByImageId) : update
    })
    let updateRouteMetadata: ((routeId: string, updates: { name?: string }) => void) | undefined
    mockStore = createMockStore([createRoute('new-route')])
    render(<TestHarness activeDraftImageId="image-1" existingRouteLines={[]} routesByImageId={routesByImageId} setRoutesByImageId={setRoutesByImageId} routeType="boulder" onMetadataUpdate={(update) => { updateRouteMetadata = update }} />)

    updateRouteMetadata?.('new-route', { name: 'New name' })

    expect(routesByImageId['image-1']).toMatchObject([{ id: 'new-route', name: 'New name' }])
  })
})
