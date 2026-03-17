import type {
  RouteLine,
  RoutePoint,
  CanvasDimensions,
  CanvasMode,
  DrawingRoute,
  ZoomTransform,
} from '@/types/domain'
import { getDynamicStrokeWidth, toScreenCoords } from '@/lib/canvasMath'

const BASE_STROKE_WIDTH = 3
const ACTIVE_STROKE_MULTIPLIER = 1.5
const LABEL_OFFSET_Y = -15
const NAME_LABEL_OFFSET_X = 10
const NAME_LABEL_OFFSET_Y = 12

export function createRoutePath2D(points: RoutePoint[]): Path2D | null {
  if (typeof Path2D === 'undefined' || points.length < 2) return null

  const path = new Path2D()
  path.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length - 1; i += 1) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    path.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }

  path.lineTo(points[points.length - 1].x, points[points.length - 1].y)

  return path
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  textColor: string = '#ffffff'
): void {
  const fontSize = 12
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
  const metrics = ctx.measureText(text)
  const padding = 6
  const cornerRadius = 4
  const bgWidth = metrics.width + padding * 2
  const bgHeight = fontSize + padding

  const bgX = x - bgWidth / 2
  const bgY = y - bgHeight / 2

  ctx.save()
  drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, cornerRadius)
  ctx.fillStyle = bgColor
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.restore()

  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function getGradeLabelPosition(points: RoutePoint[]): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 }
  const midIndex = Math.floor(points.length / 2)
  return {
    x: points[midIndex].x,
    y: points[midIndex].y + LABEL_OFFSET_Y,
  }
}

function getNameLabelPosition(points: RoutePoint[]): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 }
  const lastPoint = points[points.length - 1]
  return {
    x: lastPoint.x + NAME_LABEL_OFFSET_X,
    y: lastPoint.y + NAME_LABEL_OFFSET_Y,
  }
}

function isEditMode(mode: CanvasMode): boolean {
  return mode === 'edit-existing' || mode === 'submit'
}

export function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: RouteLine | DrawingRoute,
  isActive: boolean,
  dimensions: CanvasDimensions,
  mode: CanvasMode,
  zoomTransform: ZoomTransform = { x: 0, y: 0, scale: 1 }
): void {
  if (route.points.length < 2) return

  const scaledPoints = route.points.map((p) =>
    toScreenCoords(p.x, p.y, dimensions.width, dimensions.height, zoomTransform)
  )

  const baseWidth = getDynamicStrokeWidth(BASE_STROKE_WIDTH, zoomTransform.scale)
  const strokeWidth = isActive ? baseWidth * ACTIVE_STROKE_MULTIPLIER : baseWidth
  const color = route.color || '#ef4444'

  const path = createRoutePath2D(scaledPoints)
  if (!path) return

  if (isActive) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth * 2
    ctx.stroke(path)
    ctx.restore()
  }

  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(path)

  if (isEditMode(mode) && 'grade' in route) {
    const gradePos = getGradeLabelPosition(route.points)
    drawLabel(ctx, route.grade, gradePos.x, gradePos.y, color)
  }

  if (isEditMode(mode) && 'name' in route && route.name) {
    const namePos = getNameLabelPosition(route.points)
    drawLabel(ctx, route.name, namePos.x, namePos.y, '#1f2937')
  }
}

export function drawCurrentPoints(
  ctx: CanvasRenderingContext2D,
  points: RoutePoint[],
  color: string = '#ef4444'
): void {
  if (points.length < 2) return

  const path = createRoutePath2D(points)
  if (!path) return

  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.setLineDash([5, 5])
  ctx.stroke(path)
  ctx.setLineDash([])

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    ctx.beginPath()
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#22c55e' : color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

export function drawRoutes(
  ctx: CanvasRenderingContext2D,
  routes: RouteLine[],
  activeRouteId: string | null,
  currentPoints: RoutePoint[],
  dimensions: CanvasDimensions,
  mode: CanvasMode,
  zoomTransform: ZoomTransform = { x: 0, y: 0, scale: 1 }
): void {
  ctx.clearRect(0, 0, dimensions.width, dimensions.height)

  for (const route of routes) {
    const isActive = route.id === activeRouteId
    drawRoute(ctx, route, isActive, dimensions, mode, zoomTransform)
  }

  if (currentPoints.length > 0 && mode === 'submit') {
    const scaledCurrentPoints = currentPoints.map((p) =>
      toScreenCoords(p.x, p.y, dimensions.width, dimensions.height, zoomTransform)
    )
    drawCurrentPoints(ctx, scaledCurrentPoints)
  }
}

export function drawRouteThumbnail(
  points: RoutePoint[],
  width: number,
  height: number,
  color: string = '#ef4444'
): string {
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = width
  tempCanvas.height = height
  const ctx = tempCanvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#1f2937'
  ctx.fillRect(0, 0, width, height)

  if (points.length < 2) {
    return tempCanvas.toDataURL('image/png')
  }

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  const scaleX = width / (spanX + 40)
  const scaleY = height / (spanY + 40)
  const scale = Math.min(scaleX, scaleY, 2)
  const offsetX = (width - spanX * scale) / 2
  const offsetY = (height - spanY * scale) / 2

  const scaledPoints = points.map((point) => ({
    x: (point.x - minX) * scale + offsetX,
    y: (point.y - minY) * scale + offsetY,
  }))

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y)
  for (let i = 1; i < scaledPoints.length - 1; i++) {
    const xc = (scaledPoints[i].x + scaledPoints[i + 1].x) / 2
    const yc = (scaledPoints[i].y + scaledPoints[i + 1].y) / 2
    ctx.quadraticCurveTo(scaledPoints[i].x, scaledPoints[i].y, xc, yc)
  }
  ctx.stroke()

  return tempCanvas.toDataURL('image/png')
}
