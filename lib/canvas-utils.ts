import { RoutePoint } from './useRouteSelection'

export function drawSmoothCurve(
  ctx: CanvasRenderingContext2D,
  points: RoutePoint[],
  color: string,
  width: number,
  dash?: number[]
): void {
  if (points.length < 2) return

  ctx.strokeStyle = color
  ctx.lineWidth = width
  if (dash) ctx.setLineDash(dash)
  else ctx.setLineDash([])

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }

  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)

  ctx.stroke()
  ctx.setLineDash([])
}

export function drawRoundedRect(
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

export function drawRoundedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  font: string,
  textColor: string = '#ffffff'
): void {
  ctx.font = font
  const metrics = ctx.measureText(text)
  const padding = 6
  const cornerRadius = 4
  const bgWidth = metrics.width + padding * 2
  const bgHeight = parseInt(ctx.font, 10) + padding

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

export function getGradeLabelPosition(
  points: RoutePoint[],
  _canvasWidth?: number,
  _canvasHeight?: number,
  offset: number = -15
): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 }
  const midIndex = Math.floor(points.length / 2)
  return {
    x: points[midIndex].x,
    y: points[midIndex].y + offset
  }
}

export function getNameLabelPosition(
  points: RoutePoint[],
  offsetX: number = 10,
  offsetY: number = 12
): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 }
  const lastPoint = points[points.length - 1]
  return {
    x: lastPoint.x + offsetX,
    y: lastPoint.y + offsetY
  }
}

export function getTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const metrics = ctx.measureText(text)
  if (metrics.width <= maxWidth) return text

  while (text.length > 0) {
    const testText = text + '...'
    const testMetrics = ctx.measureText(testText)
    if (testMetrics.width <= maxWidth) {
      return testText
    }
    text = text.slice(0, -1)
  }
  return '...'
}

export function generateRouteThumbnail(
  canvas: HTMLCanvasElement,
  points: RoutePoint[],
  width: number,
  height: number
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

  const scaleX = width / (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)) + 40)
  const scaleY = height / (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) + 40)
  const scale = Math.min(scaleX, scaleY, 2)
  const offsetX = (width - (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * scale) / 2
  const offsetY = (height - (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) * scale) / 2

  const scaledPoints = points.map(p => ({
    x: (p.x - Math.min(...points.map(p => p.x))) * scale + offsetX,
    y: (p.y - Math.min(...points.map(p => p.y))) * scale + offsetY
  }))

  ctx.strokeStyle = '#ef4444'
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
