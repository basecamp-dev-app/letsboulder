import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePublishedRouteEditorSync } from '@/features/submissions/submission-editor/hooks/use-published-route-editor-sync'
import type { RouteLine } from '@/types/domain'

function createMockStore(routes: RouteLine[] = []) {
  return { routes, setRoutes: vi.fn(), setSelectedRoute: vi.fn(), setActiveRoute: vi.fn(), setEditorPanelOpen: vi.fn(), clearCanvasState: vi.fn() }
}

let mockStore = createMockStore()

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: ReturnType<typeof createMockStore>) => T) => selector(mockStore),
}))

function createRoute(id: string): RouteLine {
  return { id, image_id: 'image-1', climb_id: `climb-${id}`, points: [{ x: 0.1, y: 0.1 }, { x: 0.7, y: 0.7 }], color: 'red', sequence_order: 0, created_at: '2026-04-05T00:00:00.000Z', image_width: 1200, image_height: 900, climb: { id: `climb-${id}`, name: id, grade: '6A', status: 'approved', route_type: 'boulder', description: null } }
}

function TestHarness({ onCommit, ...props }: { activeImageId: string | null; editedRoutes: RouteLine[]; setEditedRoutes: (routes: RouteLine[]) => void; onCommit?: (commit: () => unknown) => void }) {
  const { commitRoutes } = usePublishedRouteEditorSync(props)
  onCommit?.(commitRoutes)
  return null
}

describe('usePublishedRouteEditorSync', () => {
  afterEach(() => { mockStore = createMockStore() })

  it('seeds the store and clears canvas UI on image switch', () => {
    const { rerender } = render(<TestHarness activeImageId="image-1" editedRoutes={[createRoute('route-1')]} setEditedRoutes={vi.fn()} />)
    rerender(<TestHarness activeImageId="image-2" editedRoutes={[createRoute('route-2')]} setEditedRoutes={vi.fn()} />)
    expect(mockStore.clearCanvasState).toHaveBeenCalledTimes(2)
    expect(mockStore.setRoutes).toHaveBeenLastCalledWith([createRoute('route-2')])
  })

  it('commits transient store edits only when requested', () => {
    const setEditedRoutes = vi.fn()
    let commitRoutes: (() => unknown) | undefined
    const updatedRoute = createRoute('updated-route')
    mockStore = createMockStore([updatedRoute])
    render(<TestHarness activeImageId="image-1" editedRoutes={[]} setEditedRoutes={setEditedRoutes} onCommit={(commit) => { commitRoutes = commit }} />)
    expect(setEditedRoutes).not.toHaveBeenCalled()
    commitRoutes?.()
    expect(setEditedRoutes).toHaveBeenCalledWith([updatedRoute])
  })
})
