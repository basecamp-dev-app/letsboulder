import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  createRoutePath2D,
  createRoutePathCommands,
  createRoutePathData,
} from '@/lib/route-renderer'

describe('route geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('builds deterministic midpoint quadratic geometry with exact endpoints', () => {
    const points = [
      { x: 120, y: 560 },
      { x: 360, y: 240 },
      { x: 720, y: 480 },
      { x: 960, y: 80 },
    ]

    expect(createRoutePathCommands(points)).toEqual([
      { type: 'move', point: points[0] },
      { type: 'quadratic', control: points[1], end: { x: 540, y: 360 } },
      { type: 'quadratic', control: points[2], end: { x: 840, y: 280 } },
      { type: 'line', point: points[3] },
    ])
    expect(createRoutePathData(points)).toBe(
      'M 120 560 Q 360 240 540 360 Q 720 480 840 280 L 960 80'
    )
  })

  test('replays the same commands into the online Path2D renderer', () => {
    const moveTo = vi.fn()
    const quadraticCurveTo = vi.fn()
    const lineTo = vi.fn()
    class TestPath2D {
      moveTo = moveTo
      quadraticCurveTo = quadraticCurveTo
      lineTo = lineTo
    }
    vi.stubGlobal('Path2D', TestPath2D)

    const path = createRoutePath2D([
      { x: 120, y: 560 },
      { x: 360, y: 240 },
      { x: 720, y: 480 },
      { x: 960, y: 80 },
    ])

    expect(path).toBeInstanceOf(TestPath2D)
    expect(moveTo).toHaveBeenCalledWith(120, 560)
    expect(quadraticCurveTo).toHaveBeenNthCalledWith(1, 360, 240, 540, 360)
    expect(quadraticCurveTo).toHaveBeenNthCalledWith(2, 720, 480, 840, 280)
    expect(lineTo).toHaveBeenCalledWith(960, 80)
  })

  test('rejects route lines with fewer than two points', () => {
    expect(createRoutePathCommands([{ x: 1, y: 2 }])).toEqual([])
    expect(createRoutePathData([{ x: 1, y: 2 }])).toBeNull()
  })
})
