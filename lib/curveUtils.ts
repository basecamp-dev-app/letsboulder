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

export function drawRoundedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  font: string
): void {
  console.log('Drawing label:', { text, x, y, bgColor, font })
  ctx.font = font
  const metrics = ctx.measureText(text)
  const padding = 6
  const cornerRadius = 4
  const bgWidth = metrics.width + padding * 2
  const bgHeight = parseInt(ctx.font, 10) + padding

  const bgX = x - bgWidth / 2
  const bgY = y - bgHeight / 2

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(bgX + cornerRadius, bgY)
  ctx.lineTo(bgX + bgWidth - cornerRadius, bgY)
  ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + cornerRadius)
  ctx.lineTo(bgX + bgWidth, bgY + bgHeight - cornerRadius)
  ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - cornerRadius, bgY + bgHeight)
  ctx.lineTo(bgX + cornerRadius, bgY + bgHeight)
  ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - cornerRadius)
  ctx.lineTo(bgX, bgY + cornerRadius)
  ctx.quadraticCurveTo(bgX, bgY, bgX + cornerRadius, bgY)
  ctx.closePath()

  console.log('Background rect:', { bgX, bgY, bgWidth, bgHeight, bgColor })
  ctx.fillStyle = bgColor
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.restore()

  ctx.fillStyle = 'white'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

export function getGradeLabelPosition(
  points: RoutePoint[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const midIndex = Math.floor(points.length / 2)
  const midPoint = points[midIndex]
  return { x: midPoint.x, y: midPoint.y }
}

export function getNameLabelPosition(
  points: RoutePoint[]
): { x: number; y: number } {
  const lastPoint = points[points.length - 1]
  return { x: lastPoint.x + 10, y: lastPoint.y + 12 }
}

export function getTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
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
