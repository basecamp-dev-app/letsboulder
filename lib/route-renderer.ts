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

export const BROWSE_ROUTE_COLOR = '#dc2626'
export const ACTIVE_ROUTE_COLOR = '#FFFF00'
export const SELECTED_ROUTE_COLOR = '#00FFFF'

type RoutePathCommand =
  | { type: 'move'; point: RoutePoint }
  | { type: 'quadratic'; control: RoutePoint; end: RoutePoint }
  | { type: 'line'; point: RoutePoint }

export function createRoutePathCommands(points: RoutePoint[]): RoutePathCommand[] {
  if (points.length < 2) return []

  const commands: RoutePathCommand[] = [{ type: 'move', point: points[0] }]
  for (let index = 1; index < points.length - 1; index += 1) {
    commands.push({
      type: 'quadratic',
      control: points[index],
      end: {
        x: (points[index].x + points[index + 1].x) / 2,
        y: (points[index].y + points[index + 1].y) / 2,
      },
    })
  }
  commands.push({ type: 'line', point: points[points.length - 1] })
  return commands
}

export function createRoutePathData(points: RoutePoint[]): string | null {
  const commands = createRoutePathCommands(points)
  if (commands.length === 0) return null

  return commands.map((command) => {
    if (command.type === 'move') return `M ${command.point.x} ${command.point.y}`
    if (command.type === 'line') return `L ${command.point.x} ${command.point.y}`
    return `Q ${command.control.x} ${command.control.y} ${command.end.x} ${command.end.y}`
  }).join(' ')
}

export function createRoutePath2D(points: RoutePoint[]): Path2D | null {
  if (typeof Path2D === 'undefined') return null

  const commands = createRoutePathCommands(points)
  if (commands.length === 0) return null

  const path = new Path2D()
  for (const command of commands) {
    if (command.type === 'move') {
      path.moveTo(command.point.x, command.point.y)
    } else if (command.type === 'line') {
      path.lineTo(command.point.x, command.point.y)
    } else {
      path.quadraticCurveTo(command.control.x, command.control.y, command.end.x, command.end.y)
    }
  }
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

  let color = route.color || BROWSE_ROUTE_COLOR
  if (isActive) {
    color = ACTIVE_ROUTE_COLOR
  } else if (isSelected) {
    color = SELECTED_ROUTE_COLOR
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
  color: string = ACTIVE_ROUTE_COLOR
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
