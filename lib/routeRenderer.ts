import type {
  RouteLine,
  RoutePoint,
  CanvasDimensions,
  CanvasMode,
  DrawingRoute,
  InteractionTool,
} from '@/types/domain'
import { toScreenCoords } from '@/lib/canvasMath'

const BASE_STROKE_WIDTH = 3
const ACTIVE_STROKE_MULTIPLIER = 1.5
const LABEL_OFFSET_Y = -15
const NAME_LABEL_OFFSET_X = 10
const NAME_LABEL_OFFSET_Y = 12

const COLOR_STANDARD = '#dc2626'
const COLOR_ACTIVE = '#FFFF00'
const COLOR_SELECTED = '#00FFFF'

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
  isSelected: boolean,
  dimensions: CanvasDimensions,
  mode: CanvasMode
): void {
  if (route.points.length < 2) return

  const scaledPoints = route.points.map((p) =>
    toScreenCoords(p.x, p.y, dimensions.width, dimensions.height, dimensions.centerX || 0, dimensions.centerY || 0)
  )

  const strokeWidth = isActive ? BASE_STROKE_WIDTH * ACTIVE_STROKE_MULTIPLIER : BASE_STROKE_WIDTH

  let color = route.color || COLOR_STANDARD
  if (isActive) {
    color = COLOR_ACTIVE
  } else if (isSelected) {
    color = COLOR_SELECTED
  }

  const path = createRoutePath2D(scaledPoints)
  if (!path) return

  if (isActive || isSelected) {
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
    const scaledGradePos = toScreenCoords(gradePos.x, gradePos.y, dimensions.width, dimensions.height, dimensions.centerX || 0, dimensions.centerY || 0)
    drawLabel(ctx, route.grade, scaledGradePos.x, scaledGradePos.y, color)
  }

  if (isEditMode(mode) && 'name' in route && route.name) {
    const namePos = getNameLabelPosition(route.points)
    const scaledNamePos = toScreenCoords(namePos.x, namePos.y, dimensions.width, dimensions.height, dimensions.centerX || 0, dimensions.centerY || 0)
    drawLabel(ctx, route.name, scaledNamePos.x, scaledNamePos.y, '#1f2937')
  }
}

export function drawCurrentPoints(
  ctx: CanvasRenderingContext2D,
  points: RoutePoint[],
  dimensions: CanvasDimensions,
  color: string = COLOR_ACTIVE
): void {
  if (points.length === 0) {
    return
  }

  const scaledPoints = points.map((p) =>
    toScreenCoords(p.x, p.y, dimensions.width, dimensions.height, dimensions.centerX || 0, dimensions.centerY || 0)
  )

  if (points.length === 1) {
    ctx.beginPath()
    ctx.arc(scaledPoints[0].x, scaledPoints[0].y, BASE_STROKE_WIDTH * 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    return
  }

  const path = createRoutePath2D(scaledPoints)
  if (!path) {
    return
  }

  ctx.strokeStyle = color
  ctx.lineWidth = BASE_STROKE_WIDTH
  ctx.setLineDash([5, 5])
  ctx.stroke(path)
  ctx.setLineDash([])

  for (let i = 0; i < scaledPoints.length; i += 1) {
    const point = scaledPoints[i]
    ctx.beginPath()
    ctx.arc(point.x, point.y, BASE_STROKE_WIDTH, 0, Math.PI * 2)
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
  interactionTool: InteractionTool
): void {
  if (!dimensions || dimensions.width === 0) {
    return
  }

  for (const route of routes) {
    const isActive = route.id === activeRouteId && interactionTool === 'draw'
    const isSelected = route.id === activeRouteId && interactionTool === 'select'
    drawRoute(ctx, route, isActive, isSelected, dimensions, mode)
  }

  if (currentPoints.length > 0 && interactionTool === 'draw') {
    drawCurrentPoints(ctx, currentPoints, dimensions)
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
