import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHitTesting } from '@/features/route-editor/hooks/useHitTesting'
import type { RouteLine } from '@/types/domain'

const { createRoutePath2D } = vi.hoisted(() => ({
  createRoutePath2D: vi.fn((points: Array<{ x: number; y: number }>) => ({ points }) as unknown as Path2D),
}))

vi.mock('@/lib/route-renderer', () => ({ createRoutePath2D }))
vi.mock('zustand/react/shallow', () => ({ useShallow: <T,>(selector: T) => selector }))
vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: Record<string, unknown>) => T) => selector({
    activeRouteId: null,
    setActiveRoute: vi.fn(),
    setSelectedRoute: vi.fn(),
    interactionTool: 'select',
  }),
}))

const canvasContext = {
  lineWidth: 0,
  isPointInStroke: vi.fn(() => true),
}

function createRoute(points: RouteLine['points']): RouteLine {
  return {
    id: 'route-1',
    image_id: 'image-1',
    climb_id: 'climb-1',
    points,
    color: 'red',
    sequence_order: 0,
    created_at: '2026-04-04T00:00:00.000Z',
  }
}

describe('useHitTesting', () => {
  it('rebuilds cached geometry when route points change', () => {
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => tagName === 'canvas'
      ? { getContext: () => canvasContext } as unknown as HTMLCanvasElement
      : createElement(tagName, options))
    const initialRoute = createRoute([{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }])
    const { result, rerender } = renderHook(({ routes }) => useHitTesting(routes), {
      initialProps: { routes: [initialRoute] },
    })

    result.current.findRouteAtPoint({ x: 0.2, y: 0.2 })
    expect(createRoutePath2D).toHaveBeenCalledTimes(1)

    rerender({ routes: [createRoute([{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }])] })
    result.current.findRouteAtPoint({ x: 0.3, y: 0.3 })

    expect(createRoutePath2D).toHaveBeenCalledTimes(2)
  })
})
