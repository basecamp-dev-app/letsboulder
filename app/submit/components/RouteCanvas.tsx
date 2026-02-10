'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'
import { 
  drawSmoothCurve, 
  drawRoundedLabel,
  getTruncatedText,
  getGradeLabelPosition,
  getNameLabelPosition
} from '@/lib/canvas-utils'
import GradePicker from '@/components/GradePicker'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { ImageSelection, NewRouteData, RouteLine } from '@/lib/submission-types'
import { csrfFetch } from '@/hooks/useCsrf'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

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

export default function RouteCanvas({ imageSelection, onRoutesUpdate, existingRouteLines }: RouteCanvasProps) {
  const gradeSystem = useGradeSystem()
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
  const [imageDimensions, setImageDimensions] = useState<{
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null>(null)
  const [routeGradeInfo, setRouteGradeInfo] = useState<{
    consensusGrade: string | null
    voteCount: number
    userVote: string | null
  }>({ consensusGrade: null, voteCount: 0, userVote: null })
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  useOverlayHistory({
    open: showSubmitConfirm,
    onClose: () => setShowSubmitConfirm(false),
    id: 'route-submit-confirm',
  })

  const { selectRoute, deselectRoute, clearSelection, selectedIds } = useRouteSelection()

  const fetchRouteGradeInfo = useCallback(async (routeId: string) => {
    try {
      const response = await fetch(`/api/routes/${routeId}/grades`)
      if (response.ok) {
        const data = await response.json()
        setRouteGradeInfo({
          consensusGrade: data.consensusGrade,
          voteCount: data.voteCount,
          userVote: data.userVote
        })
      }
    } catch (err) {
      console.error('Error fetching route grade info:', err)
    }
  }, [])

  const handleGradeVote = useCallback(async (grade: string) => {
    const selectedRoute = completedRoutes.find(r => selectedIds.includes(r.id))
    if (!selectedRoute) return

    try {
      const response = await csrfFetch(`/api/routes/${selectedRoute.id}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade })
      })

      if (response.ok) {
        fetchRouteGradeInfo(selectedRoute.id)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to submit grade')
      }
    } catch (err) {
      alert('Failed to submit grade')
    }
  }, [completedRoutes, selectedIds, fetchRouteGradeInfo])

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
        if (routeId.startsWith('existing-')) {
          const actualRouteId = routeId.replace('existing-', '')
          fetchRouteGradeInfo(actualRouteId)
        } else {
          fetchRouteGradeInfo(routeId)
        }
        return
      }

      clearSelection()
      setRouteGradeInfo({ consensusGrade: null, voteCount: 0, userVote: null })

      if (currentPoints.length === 0) {
        setCurrentPoints([pos])
      } else {
        setCurrentPoints(prev => [...prev, pos])
      }
    }
  }, [getMousePos, currentPoints, existingRoutes, completedRoutes, selectedIds, selectRoute, deselectRoute, clearSelection, fetchRouteGradeInfo])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.changedTouches[0]
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const canvasX = (touch.clientX - rect.left) * zoom
    const canvasY = (touch.clientY - rect.top) * zoom

    const allRoutes = [...existingRoutes, ...completedRoutes]
    const clickedRoute = findRouteAtPoint(allRoutes, { x: canvasX, y: canvasY }, 20)

    if (clickedRoute) {
      const routeId = clickedRoute.id
      if (selectedIds.includes(routeId)) {
        deselectRoute(routeId)
      } else {
        selectRoute(routeId)
      }
      if (routeId.startsWith('existing-')) {
        const actualRouteId = routeId.replace('existing-', '')
        fetchRouteGradeInfo(actualRouteId)
      } else {
        fetchRouteGradeInfo(routeId)
      }
      return
    }

    clearSelection()
    setRouteGradeInfo({ consensusGrade: null, voteCount: 0, userVote: null })

    if (currentPoints.length === 0) {
      setCurrentPoints([{ x: canvasX, y: canvasY }])
    } else {
      setCurrentPoints(prev => [...prev, { x: canvasX, y: canvasY }])
    }
  }, [zoom, currentPoints, existingRoutes, completedRoutes, selectedIds, selectRoute, deselectRoute, clearSelection, fetchRouteGradeInfo])

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
        drawRoundedLabel(ctx, formatGradeForDisplay(route.grade, gradeSystem), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

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
        drawRoundedLabel(ctx, formatGradeForDisplay(route.grade, gradeSystem), gradePos.x, gradePos.y, bgColor, 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, route.name, 150)
        const namePos = getNameLabelPosition(route.points)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, bgColor, '12px Arial')
      }
    })

    if (currentPoints.length > 0) {
      ctx.fillStyle = '#3b82f6'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
        ctx.fill()
      })

      if (currentPoints.length > 1) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 2, [5, 5])
      }

      if (currentPoints.length > 1 && currentGrade && currentName) {
        drawSmoothCurve(ctx, currentPoints, '#3b82f6', 3, [8, 4])

        const gradePos = getGradeLabelPosition(currentPoints)
        drawRoundedLabel(ctx, formatGradeForDisplay(currentGrade, gradeSystem), gradePos.x, gradePos.y, 'rgba(59, 130, 246, 0.95)', 'bold 14px Arial')

        const truncatedName = getTruncatedText(ctx, currentName, 150)
        const namePos = getNameLabelPosition(currentPoints)
        drawRoundedLabel(ctx, truncatedName, namePos.x, namePos.y, 'rgba(59, 130, 246, 0.95)', '12px Arial')
      }
    }

    ctx.restore()
  }, [completedRoutes, currentPoints, currentGrade, currentName, existingRoutes, selectedIds, pan, zoom, gradeSystem])

  useEffect(() => {
    if (imageLoaded) {
      redraw()
    }
  }, [imageLoaded, redraw])

  useEffect(() => {
    const image = imageRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!image || !canvas || !container || !image.complete || !imageDimensions) return

    canvas.width = imageDimensions.width
    canvas.height = imageDimensions.height

    const normalizedRoutes = completedRoutes.map((route, index) => {
      // The canvas fills the container but the image is letterboxed within it
      // Calculate the actual displayed image bounds within the canvas
      const canvasAspectRatio = imageDimensions.width / imageDimensions.height
      const imageAspectRatio = imageDimensions.naturalWidth / imageDimensions.naturalHeight

      let displayedImageWidth, displayedImageHeight, offsetX = 0, offsetY = 0

      if (canvasAspectRatio > imageAspectRatio) {
        // Image is letterboxed horizontally (black bars on sides)
        displayedImageHeight = imageDimensions.height
        displayedImageWidth = displayedImageHeight * imageAspectRatio
        offsetX = (imageDimensions.width - displayedImageWidth) / 2
      } else {
        // Image is letterboxed vertically (black bars on top/bottom)
        displayedImageWidth = imageDimensions.width
        displayedImageHeight = displayedImageWidth / imageAspectRatio
        offsetY = (imageDimensions.height - displayedImageHeight) / 2
      }

      const normalized = route.points.map(p => ({
        // Convert canvas coordinates to displayed image coordinates, then to natural
        x: ((p.x - offsetX) * imageDimensions.naturalWidth) / displayedImageWidth / imageDimensions.naturalWidth,
        y: ((p.y - offsetY) * imageDimensions.naturalHeight) / displayedImageHeight / imageDimensions.naturalHeight
      }))



      return {
        id: route.id,
        name: route.name,
        grade: route.grade,
        points: normalized,
        sequenceOrder: index,
        imageWidth: imageDimensions.naturalWidth,
        imageHeight: imageDimensions.naturalHeight,
        imageNaturalWidth: imageDimensions.naturalWidth,
        imageNaturalHeight: imageDimensions.naturalHeight
      }
    })

    onRoutesUpdate(normalizedRoutes)
  }, [completedRoutes, imageDimensions, onRoutesUpdate])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) return

    const rect = image.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
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
            setImageDimensions({
              width: rect.width,
              height: rect.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight
            })
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
        className="absolute cursor-crosshair select-none"
        style={{
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          touchAction: currentPoints.length > 0 ? 'none' : 'pan-y',
          WebkitTapHighlightColor: 'transparent'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchEnd={handleTouchEnd}
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

      {currentPoints.length < 2 && completedRoutes.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Routes
          </button>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2">
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

      <div className="absolute top-20 right-4 bg-white/90 dark:bg-gray-800/90 rounded-lg p-2 shadow-lg">
        <input
          type="text"
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          placeholder="Route name"
          className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-1"
        />
        <div className="relative">
          <button
            onClick={() => setGradePickerOpen(true)}
            className="w-full px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {formatGradeForDisplay(currentGrade, gradeSystem)}
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
        {selectedIds.length > 0 && completedRoutes.some(r => selectedIds.includes(r.id)) && (
          <button
            onClick={() => setGradePickerOpen(true)}
            className="w-full mt-1 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Log Grade
          </button>
        )}
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <p className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">
              Submit {completedRoutes.length} route{completedRoutes.length !== 1 ? 's' : ''}?
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Double-check you did not miss any.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-gray-100 hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitConfirm(false)
                  window.dispatchEvent(new CustomEvent('open-climb-type'))
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
