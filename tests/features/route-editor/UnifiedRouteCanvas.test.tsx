import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnifiedRouteCanvas, type UnifiedRouteCanvasRef } from '@/features/route-editor/components/UnifiedRouteCanvas'
import type { RouteLine } from '@/types/domain'

const mockDrawRoutes = vi.fn()
const mockAddPoint = vi.fn()
const mockHandleRouteClick = vi.fn()
const mockSetEditorIntent = vi.fn()
const mockSetEditorPanelOpen = vi.fn()
const mockSetSelectedRoute = vi.fn()
const mockSetActiveRoute = vi.fn()
const mockCommitCurrentRoute = vi.fn()

const routeStoreState = {
  setActiveRoute: mockSetActiveRoute,
  activeRouteId: null as string | null,
  currentPoints: [] as Array<{ x: number; y: number }>,
  interactionTool: 'select',
  selectedRouteId: null as string | null,
  currentDrawing: null,
  routeEditorDraft: null,
  editorPanelOpen: false,
  setEditorIntent: mockSetEditorIntent,
  setEditorPanelOpen: mockSetEditorPanelOpen,
  setSelectedRoute: mockSetSelectedRoute,
  commitCurrentRoute: mockCommitCurrentRoute,
}

vi.mock('@/hooks/use-container-size', () => ({
  useContainerSize: () => ({
    containerRef: vi.fn(),
    dimensions: { width: 300, height: 400 },
  }),
}))

vi.mock('@/lib/grades/preferences', () => ({
  useGradePreferences: () => ({ boulder: 'font_scale', route: 'yds_equivalent', trad: 'yds_equivalent' }),
  getGradeSystemForClimbType: () => 'font_scale',
}))

vi.mock('@/lib/media/upload-debug', () => ({ uploadDebug: vi.fn() }))
vi.mock('@/lib/grade-display', () => ({ formatGradeForDisplay: (grade: string) => grade }))
vi.mock('@/lib/route-renderer', () => ({ drawRoutes: (...args: Parameters<typeof mockDrawRoutes>) => mockDrawRoutes(...args) }))

vi.mock('@/features/route-editor/hooks/useRouteDrawing', () => ({
  useRouteDrawing: () => ({ isDrawingEnabled: routeStoreState.interactionTool === 'draw', addPoint: mockAddPoint }),
}))

vi.mock('@/features/route-editor/hooks/useHitTesting', () => ({
  useHitTesting: () => ({ handleRouteClick: mockHandleRouteClick }),
}))

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: () => routeStoreState,
}))

vi.mock('@/features/route-editor/components/RouteEditSidebar', () => ({
  RouteEditSidebar: () => <div>Route edit sidebar</div>,
}))

function createRoute(): RouteLine {
  return {
    id: 'route-1',
    image_id: 'image-1',
    climb_id: 'climb-1',
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ],
    color: 'red',
    sequence_order: 0,
    created_at: '2026-04-04T00:00:00.000Z',
    image_width: 1200,
    image_height: 1600,
    climb: {
      id: 'climb-1',
      name: 'Warm Up',
      grade: '6A',
      status: 'draft',
      route_type: 'boulder',
      description: null,
    },
  }
}

describe('UnifiedRouteCanvas', () => {
  beforeEach(() => {
    routeStoreState.activeRouteId = null
    routeStoreState.currentPoints = []
    routeStoreState.interactionTool = 'select'
    routeStoreState.selectedRouteId = null
    routeStoreState.currentDrawing = null
    routeStoreState.routeEditorDraft = null
    routeStoreState.editorPanelOpen = false
    mockAddPoint.mockReset()
    mockHandleRouteClick.mockReset()
    mockSetEditorIntent.mockReset()
    mockSetEditorPanelOpen.mockReset()
    mockSetSelectedRoute.mockReset()
    mockSetActiveRoute.mockReset()
    mockCommitCurrentRoute.mockReset()
    mockDrawRoutes.mockReset()
  })

  function getCanvasImage() {
    const image = document.querySelector('img')
    expect(image).not.toBeNull()
    return image as HTMLImageElement
  }

  function loadCanvasImage() {
    const image = getCanvasImage()
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1200 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 1600 })
    fireEvent.load(image)
  }

  it('renders an image load error state', () => {
    render(<UnifiedRouteCanvas mode="browse" imageUrl="/missing.jpg" routes={[]} />)

    fireEvent.error(getCanvasImage())

    expect(screen.getByText('Failed to load image')).toBeInTheDocument()
  })

  it('forwards selection clicks to onRouteSelect', async () => {
    const onRouteSelect = vi.fn()
    mockHandleRouteClick.mockReturnValue('route-1')

    render(<UnifiedRouteCanvas mode="browse" imageUrl="/wall.jpg" routes={[createRoute()]} onRouteSelect={onRouteSelect} />)

    loadCanvasImage()
    fireEvent.pointerDown(document.querySelector('canvas') as HTMLCanvasElement, { button: 0, clientX: 50, clientY: 75 })

    expect(onRouteSelect).toHaveBeenCalledWith('route-1')
    await waitFor(() => {
      expect(mockDrawRoutes).toHaveBeenCalled()
    })
  })

  it('adds drawing points when drawing mode is enabled', () => {
    routeStoreState.interactionTool = 'draw'

    render(<UnifiedRouteCanvas mode="submit" imageUrl="/wall.jpg" routes={[]} />)

    loadCanvasImage()
    fireEvent.pointerDown(document.querySelector('canvas') as HTMLCanvasElement, { button: 0, clientX: 90, clientY: 120 })

    expect(mockAddPoint).toHaveBeenCalledWith({ x: 0.3, y: 0.3 })
  })

  it('exposes finishRoute through the imperative ref', () => {
    const onRoutesUpdate = vi.fn()
    const ref = createRef<UnifiedRouteCanvasRef>()
    routeStoreState.currentPoints = [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.4 },
    ]

    render(<UnifiedRouteCanvas ref={ref} mode="submit" imageUrl="/wall.jpg" routes={[createRoute()]} onRoutesUpdate={onRoutesUpdate} />)

    loadCanvasImage()
    ref.current?.finishRoute()

    expect(onRoutesUpdate).toHaveBeenCalledTimes(1)
    expect(mockCommitCurrentRoute).toHaveBeenCalledTimes(1)
  })
})
