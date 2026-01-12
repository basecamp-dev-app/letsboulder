'use client'

'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import GradePicker from '@/app/draw/components/GradePicker'
import type { ImageSelection, NewRouteData, RouteLine } from '@/lib/submission-types'

interface ExistingRoute {
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
  font: string,
  textColor: string = '#ffffff'
) {
  ctx.font = font
  const metrics = ctx.measureText(text)
  const padding = 6
  const cornerRadius = 4
  const bgWidth = metrics.width + padding * 2
  const bgHeight = parseInt(ctx.font, 10) + padding

  const bgX = x - bgWidth / 2
  const bgY = y - bgHeight / 2

  ctx.fillStyle = bgColor
  drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, cornerRadius)
  ctx.fill()

  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function getGradeLabelPosition(points: RoutePoint[]): RoutePoint {
  if (points.length < 2) return { x: 0, y: 0 }
  const midIndex = Math.floor(points.length / 2)
  return {
    x: points[midIndex].x,
    y: points[midIndex].y - 15
  }
}

function getNameLabelPosition(points: RoutePoint[]): RoutePoint {
  if (points.length < 2) return { x: 0, y: 0 }
  const lastPoint = points[points.length - 1]
  return {
    x: lastPoint.x,
    y: lastPoint.y + 20
  }
}

function getTruncatedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
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

export default function RouteCanvas({ imageSelection, onRoutesUpdate, existingRouteLines }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const imageUrl = imageSelection.mode === 'existing' ? imageSelection.imageUrl : imageSelection.uploadedUrl

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [currentName, setCurrentName] = useState('')
  const [currentGrade, setCurrentGrade] = useState('6A')
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const [completedRoutes, setCompletedRoutes] = useState<ExistingRoute[]>([])
  const [existingRoutes] = useState<ExistingRoute[]>(() => {
    if (existingRouteLines && existingRouteLines.length > 0) {
      return existingRouteLines.map((rl, index) => ({
        id: `existing-${rl.id}`,
        points: rl.points,
        grade: rl.climb?.grade || '6A',
        name: rl.climb?.name || `Route ${index + 1}`
      }))
    }
    return []
  })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  const { selectRoute, deselectRoute, clearSelection, selectedIds } = useRouteSelection()

  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * zoom,
      y: (e.clientY - rect.top) * zoom
    }
  }, [zoom])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (e.button === 0 && !e.altKey) {
      const pos = getMousePos(e)

      const allRoutes = [...existingRoutes, ...completedRoutes]
      const clickedRoute = findRouteAtPoint(allRoutes, pos, 20)

      if (clickedRoute) {
        const routeId = clickedRoute.id
        if (selectedIds.includes(routeId)) {
          deselectRoute(routeId)
        } else {
          selectRoute(routeId)
        }
        return
      }

      clearSelection()

      if (currentPoints.length === 0) {
        setCurrentPoints([pos])
      } else {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [getMousePos, currentPoints, existingRoutes, completedRoutes, selectedIds, selectRoute, deselectRoute, clearSelection])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x
      const dy = e.clientY - lastPanPoint.y
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (e.buttons === 1 && !e.altKey && currentPoints.length > 0) {
      const pos = getMousePos(e)
      const lastPoint = currentPoints[currentPoints.length - 1]
      const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) + Math.pow(pos.y - lastPoint.y, 2)
      )

      if (distance > 10) {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [isPanning, lastPanPoint, getMousePos, currentPoints])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleCompleteRoute = useCallback(() => {
    if (currentPoints.length < 2) return

    const routeId = generateRouteId()
    const route: ExistingRoute = {
      id: routeId,
      points: currentPoints,
      name: currentName || `Route ${completedRoutes.length + 1}`,
      grade: currentGrade
    }

    setCompletedRoutes(prev => [...prev, route])
    setCurrentPoints([])
    setCurrentName('')
    setCurrentGrade('6A')
    selectRoute(routeId)
  }, [currentPoints, currentName, currentGrade, completedRoutes, selectRoute])

  const handleDeleteSelected = useCallback(() => {
    setCompletedRoutes(prev => prev.filter(route => !selectedIds.includes(route.id)))
    clearSelection()
  }, [selectedIds, clearSelection])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    existingRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)
      const lineColor = isSelected ? '#fbbf24' : '#9ca3af'
      const lineWidth = isSelected ? 3 : 2

      ctx.shadowColor = isSelected ? '#fbbf24' : '#6b7280'
      ctx.shadowBlur = isSelected ? 8 : 2
      drawSmoothCurve(ctx, route.points, lineColor, lineWidth, [4, 4])
      ctx.shadowBlur = 0

      if (route.points.length > 1 && isSelected) {
        const bgColor = 'rgba(251, 191, 36, 0.95)'
        const gradePos = getGradeLabelPosition(route.points)
        drawRoundedLabel(ctx, route.grade, gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 150)
        const namePos = getNameLabelPosition(route.points)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
      }
    })

    completedRoutes.forEach(route => {
      const isSelected = selectedIds.includes(route.id)

      if (isSelected) {
        ctx.shadowColor = '#fbbf24'
        ctx.shadowBlur = 10
        drawSmoothCurve(ctx, route.points, '#fbbf24', 4)
        ctx.shadowBlur = 0
      }

      drawSmoothCurve(ctx, route.points, '#dc2626', isSelected ? 4 : 3, [8, 4])

      if (route.points.length > 1) {
        const bgColor = 'rgba(220, 38, 38, 0.95)'
        const gradePos = getGradeLabelPosition(route.points)
        drawRoundedLabel(ctx, route.grade, gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 150)
        const namePos = getNameLabelPosition(route.points)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
      }
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 3, [8, 4])

        const gradePos = getGradeLabelPosition(currentPoints)
        drawRoundedLabel(ctx, currentGrade, gradePos.x, gradePos.y, 'rgba(59, 130, 246, 0.95)', 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, currentName, 150)
        const namePos = getNameLabelPosition(currentPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, 'rgba(59, 130, 246, 0.95)', '12px Arial')
      }
    }

    ctx.restore()
  }, [completedRoutes, currentPoints, currentGrade, currentName, existingRoutes, selectedIds, pan, zoom])

  useEffect(() => {
    if (imageLoaded) {
      redraw()
    }
  }, [imageLoaded, redraw])

  // Set up canvas to match image dimensions and normalize routes
  useEffect(() => {
    const image = imageRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!image || !canvas || !container || !image.complete || !imageDimensions) return

    // Size canvas to match image's rendered size
    canvas.width = imageDimensions.width
    canvas.height = imageDimensions.height

    // Normalize points to 0-1 using the image's rendered dimensions
    const normalizedRoutes = completedRoutes.map((route, index) => {
      const normalized = route.points.map(p => ({
        x: p.x / imageDimensions.width,
        y: p.y / imageDimensions.height
      }))

      return {
        id: route.id,
        name: route.name,
        grade: route.grade,
        points: normalized,
        sequenceOrder: index
      }
    })

    onRoutesUpdate(normalizedRoutes)
  }, [completedRoutes, imageDimensions, onRoutesUpdate])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    const container = containerRef.current
    if (!canvas || !image || !container || !image.complete) return

    const containerRect = container.getBoundingClientRect()
    canvas.width = containerRect.width * zoom
    canvas.height = containerRect.height * zoom
    redraw()
  }, [zoom, redraw])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  useEffect(() => {
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [setupCanvas])

  return (
    <div className="relative w-full h-full bg-gray-100 dark:bg-gray-900 overflow-hidden" ref={containerRef}>
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Route"
        className={`absolute inset-0 w-full h-full object-contain ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => {
          const img = imageRef.current
          if (img) {
            const rect = img.getBoundingClientRect()
            setImageDimensions({ width: rect.width, height: rect.height })
          }
          setImageLoaded(true)
        }}
        onError={() => setImageError(true)}
        draggable={false}
      />

      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">
          Failed to load image
        </div>
      )}

      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="absolute cursor-crosshair"
        style={{
          left: 0,
          top: 0,
          width: '100%',
          height: '100%'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {currentPoints.length >= 2 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          <button
            onClick={() => setCurrentPoints([])}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteRoute}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Complete Route
          </button>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <div className="bg-white/90 dark:bg-gray-800/90 rounded-lg p-2 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Zoom: {Math.round(zoom * 100)}%</p>
          <div className="flex gap-1">
            <button
              onClick={() => setZoom(z => Math.min(z * 1.2, 5))}
              className="p-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setZoom(z => Math.max(z * 0.8, 0.5))}
              className="p-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>

        <div className="bg-white/90 dark:bg-gray-800/90 rounded-lg p-2 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Routes: {completedRoutes.length}
            {existingRoutes.length > 0 && ` (${existingRoutes.length} existing)`}
          </p>
          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="p-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="absolute top-4 left-4 bg-white/90 dark:bg-gray-800/90 rounded-lg p-2 shadow-lg">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Controls</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Click to draw</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Middle-click or Alt+drag to pan</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Scroll to zoom</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Click route to select</p>
      </div>

      <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-gray-800/90 rounded-lg p-2 shadow-lg">
        <input
          type="text"
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          placeholder="Route name"
          className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-1"
        />
        <div className="relative">
          <button
            onClick={() => setGradePickerOpen(!gradePickerOpen)}
            className="w-full px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {currentGrade}
          </button>
          {gradePickerOpen && (
            <GradePicker
              isOpen={gradePickerOpen}
              currentGrade={currentGrade}
              onSelect={(grade) => {
                setCurrentGrade(grade)
                setGradePickerOpen(false)
              }}
              onClose={() => setGradePickerOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
