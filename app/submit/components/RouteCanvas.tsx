'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import { drawSmoothCurve, drawRoundedLabel, getGradeLabelPosition, getNameLabelPosition, getTruncatedText } from '@/lib/curveUtils'
import GradePicker, { FRENCH_GRADES } from '@/app/draw/components/GradePicker'
import type { ImageSelection, NewRouteData, RouteLine } from '@/lib/submission-types'

interface RouteCanvasProps {
  imageSelection: ImageSelection
  onRoutesUpdate: (routes: NewRouteData[]) => void
  existingRouteLines?: RouteLine[]
}

interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
}

export default function RouteCanvas({ imageSelection, onRoutesUpdate, existingRouteLines = [] }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [routes, setRoutes] = useState<RouteWithLabels[]>([])
  const [loading, setLoading] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [currentName, setCurrentName] = useState('')
  const [currentGrade, setCurrentGrade] = useState('5A')
  const [imageError, setImageError] = useState(false)
  const [gradePickerOpen, setGradePickerOpen] = useState(false)
  const { selectedIds, selectRoute, deselectRoute } = useRouteSelection()

  const imageUrl = imageSelection.mode === 'existing' ? imageSelection.imageUrl : imageSelection.uploadedUrl

  // Debug logging
  useEffect(() => {
    console.log('=== RouteCanvas Debug ===')
    console.log('imageSelection.mode:', imageSelection.mode)
    console.log('imageSelection:', JSON.stringify(imageSelection, null, 2))
    console.log('Extracted imageUrl:', imageUrl)
    console.log('========================')
  }, [imageSelection, imageUrl])

  const drawSmoothCurveCtx = useCallback((ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) => {
    drawSmoothCurve(ctx, points, color, width, dash)
  }, [])

  const drawRoundedLabelCtx = useCallback((ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bgColor: string, font: string) => {
    drawRoundedLabel(ctx, text, x, y, bgColor, font)
  }, [])

  const getGradeLabelPositionCtx = useCallback((points: RoutePoint[], canvasWidth: number, canvasHeight: number) => {
    return getGradeLabelPosition(points, canvasWidth, canvasHeight)
  }, [])

  const getNameLabelPositionCtx = useCallback((points: RoutePoint[]) => {
    return getNameLabelPosition(points)
  }, [])

  const getTruncatedTextCtx = useCallback((ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    return getTruncatedText(ctx, text, maxWidth)
  }, [])

  const drawRouteWithLabels = useCallback((ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1, isHighlighted = false) => {
    const { points, grade, name, id } = route
    const isSelectedRoute = selectedIds.includes(id)

    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    if (isSelectedRoute || isHighlighted) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 10
      drawSmoothCurveCtx(ctx, scaledPoints, '#fbbf24', 5, [8, 4])
      ctx.shadowBlur = 0
    }

    drawSmoothCurveCtx(ctx, scaledPoints, '#dc2626', 3, [8, 4])

    if (scaledPoints.length > 1) {
      const gradePos = getGradeLabelPositionCtx(scaledPoints, ctx.canvas.width, ctx.canvas.height)
      drawRoundedLabelCtx(ctx, grade, gradePos.x, gradePos.y, 'rgba(220, 38, 38, 0.95)', 'bold 14px Arial')

      const truncatedName = getTruncatedTextCtx(ctx, name, 120)
      const namePos = getNameLabelPositionCtx(scaledPoints)
      drawRoundedLabelCtx(ctx, truncatedName, namePos.x, namePos.y, 'rgba(220, 38, 38, 0.95)', '12px Arial')
    }
  }, [selectedIds, drawSmoothCurveCtx, drawRoundedLabelCtx, getGradeLabelPositionCtx, getNameLabelPositionCtx, getTruncatedTextCtx])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

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
      drawSmoothCurveCtx(ctx, scaledPoints, '#9ca3af', 2, [4, 4])
      ctx.shadowBlur = 0
    })

    routes.forEach(route => {
      const isRouteSelected = selectedIds.includes(route.id)
      drawRouteWithLabels(ctx, route, scaleX, scaleY, isRouteSelected)
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurveCtx(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        const previewRoute: RouteWithLabels = {
          id: 'preview',
          points: currentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute, 1, 1, false)
      }
    }
  }, [routes, currentPoints, currentGrade, currentName, existingRouteLines, selectedIds, drawRouteWithLabels, drawSmoothCurveCtx])

  useEffect(() => {
    if (imageLoaded) redraw()
  }, [routes, currentPoints, imageLoaded, redraw])

  const handleImageError = useCallback(() => {
    console.error('Failed to load image:', imageUrl)
    console.error('image.complete:', imageRef.current?.complete)
    console.error('image.naturalWidth:', imageRef.current?.naturalWidth)
    console.error('image.src:', imageRef.current?.src)
    setImageError(true)
    setLoading(false)
  }, [imageUrl])

  const handleImageLoad = useCallback(() => {
    console.log('handleImageLoad called')
    console.log('image.complete:', imageRef.current?.complete)
    console.log('image.naturalWidth:', imageRef.current?.naturalWidth)
    
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) {
      console.log('canvas or image is null in handleImageLoad')
      return
    }

    const container = canvas.parentElement
    if (container) {
      const containerRect = container.getBoundingClientRect()
      const containerAspect = containerRect.width / containerRect.height
      const imageAspect = image.naturalWidth / image.naturalHeight

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

      console.log('Setting canvas size:', displayWidth, 'x', displayHeight)
      
      canvas.style.left = `${offsetX}px`
      canvas.style.top = `${offsetY}px`
      canvas.width = displayWidth
      canvas.height = displayHeight
    }
    setImageLoaded(true)
    setLoading(false)
    redraw()
    console.log('Image load complete')
  }, [redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    
    if (!canvas || !image) {
      console.log('RouteCanvas: refs not ready, will retry')
      // Retry after a tick to let DOM settle
      const retryId = setTimeout(() => {
        const retryCanvas = canvasRef.current
        const retryImage = imageRef.current
        if (retryCanvas && retryImage) {
          console.log('RouteCanvas: retry successful')
          setupAndMonitorImage(retryCanvas, retryImage)
        }
      }, 100)
      return () => clearTimeout(retryId)
    }
    
    console.log('RouteCanvas: refs ready, setting up')
    setupAndMonitorImage(canvas, image)
  }, [imageUrl])

  const setupAndMonitorImage = useCallback((canvas: HTMLCanvasElement, image: HTMLImageElement) => {
    console.log('setupAndMonitorImage called')
    console.log('image.complete:', image.complete)
    console.log('image.naturalWidth:', image.naturalWidth)

    // Timeout for image loading (10 seconds)
    const timeoutId = setTimeout(() => {
      if (!image.complete || image.naturalWidth === 0) {
        console.error('Image load timeout')
        console.error('image.complete:', image.complete)
        console.error('image.naturalWidth:', image.naturalWidth)
        setImageError(true)
        setLoading(false)
      }
    }, 10000)

    if (image.complete && image.naturalWidth > 0) {
      console.log('Image already loaded')
      clearTimeout(timeoutId)
      handleImageLoad()
    } else {
      console.log('Waiting for image load...')
      image.addEventListener('load', () => {
        console.log('Load event fired')
        clearTimeout(timeoutId)
        handleImageLoad()
      })
      image.addEventListener('error', () => {
        console.error('Image error event')
        clearTimeout(timeoutId)
        handleImageError()
      })
    }
  }, [handleImageLoad, handleImageError])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

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

    const clickedRoute = findRouteAtPoint(routes, { x, y }, 20)

    if (clickedRoute) {
      selectRoute(clickedRoute.id)
    } else {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
      deselectRoute(selectedIds[0] || '')
    }
  }, [routes, selectedIds, selectRoute, deselectRoute])

  const handleCanvasTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const touch = e.changedTouches[0]

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = touch.clientX - canvasRect.left
    const canvasY = touch.clientY - canvasRect.top

    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return
    }

    setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
  }, [])

  const handleFinishRoute = useCallback(() => {
    if (currentPoints.length > 1 && currentName.trim() && currentGrade) {
      const routeName = currentName.trim() || `Route ${routes.length + 1}`

      const scaleX = canvasRef.current ? canvasRef.current.width / (imageRef.current?.naturalWidth || 1) : 1
      const scaleY = canvasRef.current ? canvasRef.current.height / (imageRef.current?.naturalHeight || 1) : 1

      const naturalPoints = currentPoints.map(p => ({
        x: p.x / scaleX,
        y: p.y / scaleY
      }))

      const newRoute: RouteWithLabels = {
        id: generateRouteId(),
        points: naturalPoints,
        grade: currentGrade,
        name: routeName
      }

      const allRoutes: NewRouteData[] = [...routes.map((r, i) => ({
        id: r.id,
        name: r.name,
        grade: r.grade,
        points: r.points,
        sequenceOrder: i
      })), {
        id: newRoute.id,
        name: newRoute.name,
        grade: newRoute.grade,
        points: newRoute.points,
        sequenceOrder: routes.length
      }]
      
      setRoutes(allRoutes.map(r => ({
        id: r.id,
        name: r.name,
        grade: r.grade,
        points: r.points
      })))
      onRoutesUpdate(allRoutes)
      
      setCurrentPoints([])
      setCurrentName('')
      setCurrentGrade('5A')
    }
  }, [currentPoints, currentName, currentGrade, routes.length, onRoutesUpdate, routes])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (currentPoints.length >= 2) {
          handleFinishRoute()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPoints, currentName, currentGrade, handleFinishRoute])

  const handleUndo = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints(prev => prev.slice(0, -1))
    } else if (routes.length > 0) {
      const updatedRoutes = routes.slice(0, -1)
      setRoutes(updatedRoutes)
      onRoutesUpdate(updatedRoutes.map((r, i) => ({
        id: r.id,
        name: r.name,
        grade: r.grade,
        points: r.points,
        sequenceOrder: i
      })))
    }
  }

  const handleClearCurrent = () => {
    setCurrentPoints([])
    setCurrentName('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400">Loading image...</p>
        </div>
      </div>
    )
  }

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
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Climbing area"
          className="max-w-full max-h-full object-contain"
          onError={handleImageError}
          onLoad={() => console.log('IMG onLoad fired')}
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
              disabled={currentPoints.length < 2 || !currentGrade}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finish Route
            </button>
            <button
              onClick={handleUndo}
              disabled={currentPoints.length === 0 && routes.length === 0}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Undo
            </button>
            <button
              onClick={handleClearCurrent}
              disabled={currentPoints.length === 0}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {routes.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Drawn routes ({routes.length})
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {routes.map((route, index) => (
                  <div
                    key={route.id}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded"
                  >
                    <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{route.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{route.grade}</span>
                  </div>
                ))}
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
