'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import GradePicker from '@/app/draw/components/GradePicker'
import type { ImageSelection, NewRouteData, RouteLine } from '@/lib/submission-types'

interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
}

interface RouteCanvasProps {
  imageSelection: ImageSelection
  onRoutesUpdate: (routes: NewRouteData[]) => void
  existingRouteLines?: RouteLine[]
}

function drawSmoothCurve(ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) {
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

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

function drawRoundedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  font: string
) {
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

  ctx.fillStyle = 'white'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function getGradeLabelPosition(
  points: RoutePoint[]
): { x: number; y: number } {
  const midIndex = Math.floor(points.length / 2)
  const midPoint = points[midIndex]
  return { x: midPoint.x, y: midPoint.y - 10 }
}

function getNameLabelPosition(
  points: RoutePoint[]
): { x: number; y: number } {
  const lastPoint = points[points.length - 1]
  return { x: lastPoint.x + 12, y: lastPoint.y + 5 }
}

function getTruncatedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
}

function convertToNaturalCoords(points: RoutePoint[], scaleX: number, scaleY: number): RoutePoint[] {
  return points.map(p => ({
    x: p.x / scaleX,
    y: p.y / scaleY
  }))
}

export default function RouteCanvas({ imageSelection, onRoutesUpdate, existingRouteLines = [] }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [completedRoutes, setCompletedRoutes] = useState<RouteWithLabels[]>([])
  const [currentName, setCurrentName] = useState('')
  const [currentGrade, setCurrentGrade] = useState('5A')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const { selectedIds, selectRoute, deselectRoute } = useRouteSelection()

  const imageUrl = imageSelection.mode === 'existing' 
    ? imageSelection.imageUrl 
    : imageSelection.uploadedUrl

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const scaleX = canvas.width / image.naturalWidth
    const scaleY = canvas.height / image.naturalHeight

    existingRouteLines.forEach((routeLine) => {
      const scaledPoints = routeLine.points.map(point => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      }))
      
      ctx.shadowColor = '#6b7280'
      ctx.shadowBlur = 2
      drawSmoothCurve(ctx, scaledPoints, '#9ca3af', 2, [4, 4])
      ctx.shadowBlur = 0
    })

    completedRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)
      
      if (isSelected) {
        ctx.shadowColor = '#fbbf24'
        ctx.shadowBlur = 10
        const scaledPoints = route.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
        drawSmoothCurve(ctx, scaledPoints, '#fbbf24', 5, [8, 4])
        ctx.shadowBlur = 0
      }

      const scaledPoints = route.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
      drawSmoothCurve(ctx, scaledPoints, '#dc2626', 3, [8, 4])

      if (scaledPoints.length > 1) {
        const bgColor = 'rgba(220, 38, 38, 0.95)'
        const gradePos = getGradeLabelPosition(scaledPoints)
        drawRoundedLabel(ctx, route.grade, gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 120)
        const namePos = getNameLabelPosition(scaledPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
      }
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        const scaledPoints = currentPoints.map(p => ({ x: p.x, y: p.y }))
        drawSmoothCurve(ctx, scaledPoints, '#3b82f6', 3, [8, 4])

        const gradePos = getGradeLabelPosition(scaledPoints)
        drawRoundedLabel(ctx, currentGrade, gradePos.x, gradePos.y, 'rgba(59, 130, 246, 0.95)', 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, currentName, 120)
        const namePos = getNameLabelPosition(scaledPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, 'rgba(59, 130, 246, 0.95)', '12px Arial')
      }
    }
  }, [completedRoutes, currentPoints, currentGrade, currentName, existingRouteLines, selectedIds])

  useEffect(() => {
    if (imageLoaded) {
      redraw()
    }
  }, [imageLoaded, redraw])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    const container = containerRef.current
    if (!canvas || !image || !container || !image.complete) return

    const containerRect = container.getBoundingClientRect()
    const imageAspect = image.naturalWidth / image.naturalHeight
    const containerAspect = containerRect.width / containerRect.height

    let displayWidth, displayHeight, offsetX = 0, offsetY = 0

    if (imageAspect > containerAspect) {
      displayWidth = containerRect.width
      displayHeight = containerRect.width / imageAspect
      offsetY = (containerRect.height - displayHeight) / 2
    } else {
      displayHeight = containerRect.height
      displayWidth = containerRect.height * imageAspect
      offsetX = (containerRect.width - displayWidth) / 2
    }

    canvas.style.left = `${offsetX}px`
    canvas.style.top = `${offsetY}px`
    canvas.width = displayWidth
    canvas.height = displayHeight

    setImageLoaded(true)
  }, [])

  useEffect(() => {
    const image = imageRef.current
    if (!image) return

    const handleLoad = () => {
      setupCanvas()
    }

    if (image.complete) {
      handleLoad()
    } else {
      image.addEventListener('load', handleLoad)
    }

    return () => image.removeEventListener('load', handleLoad)
  }, [imageUrl, setupCanvas])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    resizeObserverRef.current = new ResizeObserver(() => {
      if (imageLoaded) {
        setupCanvas()
        redraw()
      }
    })

    resizeObserverRef.current.observe(container)
    return () => {
      resizeObserverRef.current?.disconnect()
    }
  }, [imageLoaded, setupCanvas, redraw])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !imageLoaded) return

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - canvasRect.left
    const canvasY = e.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    const scaleX = image.naturalWidth / canvas.width
    const scaleY = image.naturalHeight / canvas.height
    const x = canvasX * scaleX
    const y = canvasY * scaleY

    const clickedRoute = findRouteAtPoint(completedRoutes, { x, y }, 20)

    if (clickedRoute) {
      selectRoute(clickedRoute.id)
      setCurrentName(clickedRoute.name)
      setCurrentGrade(clickedRoute.grade)
      setCurrentPoints([])
    } else {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
      deselectRoute(selectedIds[0] || '')
    }
  }, [completedRoutes, selectedIds, imageLoaded, selectRoute, deselectRoute])

  const handleCanvasTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas || !imageLoaded) return

    const touch = e.changedTouches[0]
    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = touch.clientX - canvasRect.left
    const canvasY = touch.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
  }, [imageLoaded])

  const handleFinishRoute = useCallback(() => {
    if (currentPoints.length < 2) return

    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const scaleX = canvas.width / image.naturalWidth
    const scaleY = canvas.height / image.naturalHeight

    const naturalPoints = convertToNaturalCoords(currentPoints, scaleX, scaleY)
    const routeName = currentName.trim() || `Route ${completedRoutes.length + 1}`

    const newRoute: RouteWithLabels = {
      id: generateRouteId(),
      points: naturalPoints,
      grade: currentGrade,
      name: routeName
    }

    const updatedRoutes = [...completedRoutes, newRoute]
    setCompletedRoutes(updatedRoutes)
    onRoutesUpdate(updatedRoutes.map((r, i) => ({
      id: r.id,
      name: r.name,
      grade: r.grade,
      points: r.points,
      sequenceOrder: i
    })))

    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('5A')
    deselectRoute(selectedIds[0] || '')
  }, [currentPoints, currentName, currentGrade, completedRoutes, onRoutesUpdate, selectedIds, deselectRoute])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && currentPoints.length >= 2) {
        handleFinishRoute()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPoints, currentName, currentGrade, handleFinishRoute])

  const handleUndo = useCallback(() => {
    if (currentPoints.length > 0) {
      setCurrentPoints(prev => prev.slice(0, -1))
    } else if (completedRoutes.length > 0) {
      const updatedRoutes = completedRoutes.slice(0, -1)
      setCompletedRoutes(updatedRoutes)
      onRoutesUpdate(updatedRoutes.map((r, i) => ({
        id: r.id,
        name: r.name,
        grade: r.grade,
        points: r.points,
        sequenceOrder: i
      })))
      deselectRoute(selectedIds[0] || '')
    }
  }, [currentPoints, completedRoutes, onRoutesUpdate, selectedIds, deselectRoute])

  const handleClearCurrent = useCallback(() => {
    setCurrentPoints([])
    setCurrentName('')
    deselectRoute(selectedIds[0] || '')
  }, [selectedIds, deselectRoute])

  if (imageError) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div className="text-center p-4">
          <p className="text-red-600 dark:text-red-400 mb-2">Failed to load image</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Image URL: {imageUrl}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg" ref={containerRef}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Climbing area"
          className="max-w-full max-h-full object-contain"
          onError={() => setImageError(true)}
        />
        <canvas
          ref={canvasRef}
          className="absolute cursor-crosshair"
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasTouch}
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 mt-2 rounded-lg">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Route name"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => setGradePickerOpen(true)}
              className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-center hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              {currentGrade}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFinishRoute}
              disabled={currentPoints.length < 2}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finish Route
            </button>
            <button
              onClick={handleUndo}
              disabled={currentPoints.length === 0 && completedRoutes.length === 0}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Undo
            </button>
            <button
              onClick={handleClearCurrent}
              disabled={currentPoints.length === 0 && selectedIds.length === 0}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {completedRoutes.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Drawn routes ({completedRoutes.length})
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {completedRoutes.map((route, index) => {
                  const isSelected = selectedIds.includes(route.id)
                  return (
                    <button
                      key={route.id}
                      onClick={() => selectRoute(route.id)}
                      className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <span className={`w-6 h-6 text-xs rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">{route.name}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{route.grade}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <GradePicker
          isOpen={gradePickerOpen}
          onClose={() => setGradePickerOpen(false)}
          onSelect={(grade) => setCurrentGrade(grade)}
          currentGrade={currentGrade}
          mode="select"
        />
      </div>
    </div>
  )
}
