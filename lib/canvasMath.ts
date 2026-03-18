import type { RoutePoint, ZoomTransform, CanvasDimensions } from '@/types/domain'

export type CoordinateSystem = 'normalized' | 'pixel' | 'canvas'

export function detectCoordinateSystem(
  points: RoutePoint[],
  dims: CanvasDimensions
): CoordinateSystem {
  if (points.length < 2) return 'normalized'

  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))

  if (maxX <= 1.2 && maxY <= 1.2) {
    return 'normalized'
  }

  const fitsCanvasSpace = maxX <= dims.width * 1.05 && maxY <= dims.height * 1.05
  if (fitsCanvasSpace) {
    return 'canvas'
  }

  return 'pixel'
}

export function normalizePoints(
  points: RoutePoint[],
  dims: CanvasDimensions,
  originalWidth?: number,
  originalHeight?: number
): RoutePoint[] {
  if (points.length < 2) return []

  const system = detectCoordinateSystem(points, dims)

  if (system === 'normalized') {
    return points.map((point) => ({
      x: Math.min(1, Math.max(0, point.x)),
      y: Math.min(1, Math.max(0, point.y)),
    }))
  }

  if (system === 'canvas') {
    return points.map((point) => ({
      x: Math.min(1, Math.max(0, point.x / dims.width)),
      y: Math.min(1, Math.max(0, point.y / dims.height)),
    }))
  }

  const baseWidth = originalWidth || dims.naturalWidth
  const baseHeight = originalHeight || dims.naturalHeight

  if (!baseWidth || !baseHeight) return []

  return points
    .map((point) => ({
      x: Math.min(1, Math.max(0, point.x / baseWidth)),
      y: Math.min(1, Math.max(0, point.y / baseHeight)),
    }))
    .filter((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
}

export function toScreenCoords(
  normX: number,
  normY: number,
  width: number,
  height: number,
  offsetX: number = 0,
  offsetY: number = 0
): RoutePoint {
  return {
    x: offsetX + (normX * width),
    y: offsetY + (normY * height),
  }
}

export function toNormalizedCoords(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  transform: ZoomTransform
): RoutePoint {
  const logicalX = (screenX - transform.x) / transform.scale
  const logicalY = (screenY - transform.y) / transform.scale

  return {
    x: Math.min(1, Math.max(0, logicalX / width)),
    y: Math.min(1, Math.max(0, logicalY / height)),
  }
}

export function getDynamicStrokeWidth(baseWidth: number, scale: number): number {
  return baseWidth / scale
}

export function screenToCanvasCoords(
  screenX: number,
  screenY: number,
  transform: ZoomTransform
): RoutePoint {
  return {
    x: (screenX - transform.x) / transform.scale,
    y: (screenY - transform.y) / transform.scale,
  }
}

export function canvasToScreenCoords(
  canvasX: number,
  canvasY: number,
  transform: ZoomTransform
): RoutePoint {
  return {
    x: canvasX * transform.scale + transform.x,
    y: canvasY * transform.scale + transform.y,
  }
}
