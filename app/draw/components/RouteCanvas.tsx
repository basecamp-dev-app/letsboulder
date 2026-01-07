'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouteSelection, RoutePoint, generateRouteId, findRouteAtPoint } from '@/lib/useRouteSelection'

interface RouteCanvasProps {
  imageUrl: string
  latitude: number | null // Changed to allow null
  longitude: number | null // Changed to allow null
  sessionId: string
  hasGps: boolean // Added
}

interface Climb {
  id: string
  name: string
  grade: string
  image_url?: string
  description?: string
  crags: { name: string; latitude: number; longitude: number }
  _fullLoaded?: boolean
}

interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
}

export default function RouteCanvas({ imageUrl, latitude, longitude, sessionId, hasGps }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [climbs, setClimbs] = useState<Climb[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null)
  const [imageError, setImageError] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [currentGrade, setCurrentGrade] = useState('V0')
  const [currentName, setCurrentName] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [routes, setRoutes] = useState<RouteWithLabels[]>([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null)
  const { selectedIds, selectRoute, deselectRoute, isSelected } = useRouteSelection()

  function catmullRomSpline(points: RoutePoint[], _tension = 0.5, numOfSegments = 16): RoutePoint[] {
    const splinePoints: RoutePoint[] = []
    if (points.length < 2) return points

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[0]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = i !== points.length - 2 ? points[i + 2] : p2

      for (let t = 0; t <= numOfSegments; t++) {
        const t2 = t / numOfSegments
        const t3 = t2 * t2
        const t2_3 = 3 * t2 * t2

        const f1 = -0.5 * t3 + t2_3 - 0.5 * t2
        const f2 = 1.5 * t3 - 2.5 * t2_3 + 1
        const f3 = -1.5 * t3 + 2 * t2_3 + 0.5 * t2
        const f4 = 0.5 * t3 - 0.5 * t2_3

        const x = p0.x * f1 + p1.x * f2 + p2.x * f3 + p3.x * f4
        const y = p0.y * f1 + p1.y * f2 + p2.y * f3 + p3.y * f4

        splinePoints.push({ x, y })
      }
    }
    return splinePoints
  }

  function drawSmoothCurve(ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) {
    if (points.length < 2) return

    const smoothedPoints = catmullRomSpline(points, 0.5, 20)

    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(smoothedPoints[0].x, smoothedPoints[0].y)
    for (let i = 1; i < smoothedPoints.length; i++) {
      ctx.lineTo(smoothedPoints[i].x, smoothedPoints[i].y)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1, isHighlighted = false) => {
    const { points, grade, name, id } = route
    const isSelected = selectedIds.includes(id)

    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    if (isSelected || isHighlighted) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur = 10
      drawSmoothCurve(ctx, scaledPoints, '#fbbf24', 5, [8, 4])
      ctx.shadowBlur = 0
    }

    drawSmoothCurve(ctx, scaledPoints, 'red', 3, [8, 4])

    if (scaledPoints.length > 1) {
      // Calculate midpoint for grade
      const midIndex = Math.floor(scaledPoints.length / 2)
      const gradePoint = scaledPoints[midIndex]

      // Draw grade label with red background
      ctx.font = 'bold 14px Arial'
      const gradeWidth = ctx.measureText(grade).width
      const gradeHeight = 16 // Approximate text height including ascenders/descenders
      const gradePadding = 2

      // Draw red background - center on the text position
      ctx.fillStyle = 'red'
      ctx.fillRect(
        gradePoint.x - gradeWidth/2 - gradePadding,
        gradePoint.y - gradeHeight/2 - 2, // Center vertically on text
        gradeWidth + gradePadding * 2,
        gradeHeight
      )

      // Draw white text
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.fillText(grade, gradePoint.x, gradePoint.y + 4) // Adjust baseline

      // Calculate end point for name (bottom of climb)
      const lastPoint = scaledPoints[scaledPoints.length - 1]
      const nameX = lastPoint.x + 15 // Position to the right of endpoint
      const nameY = lastPoint.y + 5

      // Draw name label with red background
      ctx.font = '12px Arial'
      const nameWidth = ctx.measureText(name).width
      const nameHeight = 14 // Approximate text height
      const namePadding = 2

      // Draw red background - position properly around text
      ctx.fillStyle = 'red'
      ctx.fillRect(
        nameX - namePadding,
        nameY - nameHeight + 3, // Adjust to properly contain text
        nameWidth + namePadding * 2,
        nameHeight
      )

      // Draw white text
      ctx.fillStyle = 'white'
      ctx.textAlign = 'left'
      ctx.fillText(name, nameX, nameY)
    }
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Since canvas is now sized to match displayed image, scale directly
    const scaleX = canvas.width / image.naturalWidth
    const scaleY = canvas.height / image.naturalHeight

    // Draw completed routes with labels, scaled to display size
    routes.forEach(route => {
      const isRouteSelected = selectedIds.includes(route.id)
      drawRouteWithLabels(ctx, route, scaleX, scaleY, isRouteSelected)
    })

    // Draw current points (scaled)
    if (currentPoints.length > 0) {
      // Scale current points to display size
      const scaledCurrentPoints = currentPoints.map(point => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      }))

      // Draw points
      ctx.fillStyle = 'blue'
      scaledCurrentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      // Draw connecting dotted curve
      if (scaledCurrentPoints.length > 1) {
        drawSmoothCurve(ctx, scaledCurrentPoints, 'blue', 2, [5, 5])
      }

      // Preview labels for current route
      if (scaledCurrentPoints.length > 1 && currentGrade && currentName) {
        const previewRoute: RouteWithLabels = {
          id: 'preview',
          points: scaledCurrentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute)
      }
    }
   }, [routes, currentPoints, currentGrade, currentName, imageUrl])

  useEffect(() => {
    if (imageLoaded) redraw()
  }, [routes, currentPoints, imageLoaded, redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const handleImageLoad = () => {
      // Size and position canvas to match the actual displayed image
      const container = canvas.parentElement
      if (container) {
        const containerRect = container.getBoundingClientRect()
        const containerAspect = containerRect.width / containerRect.height
        const imageAspect = image.naturalWidth / image.naturalHeight

        let displayWidth, displayHeight, offsetX = 0, offsetY = 0
        if (imageAspect > containerAspect) {
          // Image is wider than container - fit by width, center vertically
          displayWidth = containerRect.width
          displayHeight = containerRect.width / imageAspect
          offsetY = (containerRect.height - displayHeight) / 2
        } else {
          // Image is taller than container - fit by height, center horizontally
          displayHeight = containerRect.height
          displayWidth = containerRect.height * imageAspect
          offsetX = (containerRect.width - displayWidth) / 2
        }

        // Position canvas to match image position
        canvas.style.left = `${offsetX}px`
        canvas.style.top = `${offsetY}px`
        canvas.width = displayWidth
        canvas.height = displayHeight
      }
      setImageLoaded(true)
      redraw()
    }

    if (image.complete) {
      handleImageLoad()
    } else {
      image.addEventListener('load', handleImageLoad)
    }

    return () => image.removeEventListener('load', handleImageLoad)
  }, [imageUrl])








  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

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
      const routeIndex = routes.findIndex(r => r.id === clickedRoute.id)
      if (routeIndex !== -1) {
        setSelectedRouteIndex(routeIndex)
        setCurrentName(clickedRoute.name)
        setCurrentGrade(clickedRoute.grade)
      }
    } else {
      setCurrentPoints(prev => [...prev, { x, y }])
      deselectRoute(selectedIds[0] || '')
      setSelectedRouteIndex(null)
    }
  }, [routes, selectedIds, selectRoute, deselectRoute])

  const handleCanvasTouch = useCallback((e: React.TouchEvent) => {
    e.preventDefault() // Prevent scrolling/zooming
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const touch = e.changedTouches[0]

    // Get touch coordinates relative to canvas
    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = touch.clientX - canvasRect.left
    const canvasY = touch.clientY - canvasRect.top

    // Validate touch is within canvas bounds
    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return // Touch outside canvas, ignore
    }

    // Scale coordinates from display size to natural image size
    const scaleX = image.naturalWidth / canvas.width
    const scaleY = image.naturalHeight / canvas.height
    const x = canvasX * scaleX
    const y = canvasY * scaleY

    setCurrentPoints(prev => [...prev, { x, y }])
  }, [])

  const handleFinishRoute = useCallback(() => {
    console.log('Finish Route button clicked - Points:', currentPoints.length, 'Name:', currentName.trim())
    if (currentPoints.length > 1) {
      const routeName = currentName.trim() || `Route ${routes.length + 1}`
      console.log('Finishing route:', routeName, currentGrade, currentPoints.length, 'points')
      const newRoute: RouteWithLabels = {
        id: generateRouteId(),
        points: [...currentPoints],
        grade: currentGrade,
        name: routeName
      }
      setRoutes(prev => [...prev, newRoute])
      setCurrentPoints([])
      setCurrentName('')
      setSelectedRouteIndex(null)
      console.log('Route finished, total routes:', routes.length + 1)
    } else {
      console.log('Cannot finish route: points =', currentPoints.length)
      alert('Please add at least 2 points to the route')
    }
  }, [currentPoints, currentName, currentGrade, routes.length])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('Enter key pressed - Points:', currentPoints.length, 'Name:', currentName.trim())
      if (currentPoints.length >= 2) {
        console.log('Finishing route via Enter key')
        handleFinishRoute()
      } else {
        console.log('Cannot finish: need 2+ points')
      }
    }
  }, [currentPoints, currentName])



  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])



  const handleUndo = () => {
    if (currentPoints.length > 0) {
      // Undo last point if currently drawing
      setCurrentPoints(prev => prev.slice(0, -1))
    } else if (routes.length > 0) {
      // Undo last route if no current drawing
      setRoutes(prev => prev.slice(0, -1))
      if (selectedRouteIndex !== null && selectedRouteIndex >= routes.length - 1) {
        setSelectedRouteIndex(null)
      }
    }
  }

  const handleSave = () => {
    console.log('Save button clicked - routes to save:', routes.length)
    if (routes.length === 0) {
      alert('Please finish at least one route before saving')
      return
    }
    // Save routes to localStorage for now, redirect to naming
    const routeData = {
      imageUrl,
      latitude,
      longitude,
      routes,
      sessionId
    }
    localStorage.setItem('routeSession', JSON.stringify(routeData))
    console.log('Routes saved, redirecting to name-routes')
    window.location.href = `/name-routes?sessionId=${sessionId}`
  }

  const handleClearCurrent = () => {
    setCurrentPoints([])
    setCurrentName('')
    setSelectedRouteIndex(null)
  }

  const handleSelectRoute = (index: number) => {
    const route = routes[index]
    setSelectedRouteIndex(index)
    setCurrentName(route.name)
    setCurrentGrade(route.grade)
    setCurrentPoints([]) // Clear current drawing
  }

  const handleUpdateRoute = () => {
    if (selectedRouteIndex !== null) {
      setRoutes(prev => prev.map((route, i) =>
        i === selectedRouteIndex
          ? { ...route, name: currentName.trim() || route.name, grade: currentGrade }
          : route
      ))
      setSelectedRouteIndex(null)
      setCurrentName('')
    }
  }

    return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-gray-900 dark:bg-gray-950">
      {/* Image container - fills available space, no cropping */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Climbing route"
          className="max-w-full max-h-full object-contain"
        />
        <canvas
          ref={canvasRef}
          className="absolute cursor-crosshair"
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasTouch}
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />
      </div>

      {/* Compact controls overlay */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3">
        <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
          {/* Top row: Name input and grade */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Route name"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              placeholder="Grade"
              value={currentGrade}
              onChange={(e) => setCurrentGrade(e.target.value)}
              className="w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Second row: Action buttons */}
          <div className="flex gap-1">
            <button
              onClick={handleFinishRoute}
              className="flex-1 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length < 2}
            >
              Finish Route
            </button>
            <button
              onClick={handleUndo}
              className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length === 0 && routes.length === 0}
            >
              Undo
            </button>
            <button
              onClick={handleClearCurrent}
              className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              disabled={currentPoints.length === 0 && selectedRouteIndex === null}
            >
              Clear
            </button>
            {selectedRouteIndex !== null && (
              <button
                onClick={handleUpdateRoute}
                className="bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Update
              </button>
            )}
          </div>

          {/* Third row: Save button */}
          <button
            onClick={handleSave}
            className="bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            disabled={routes.length === 0}
          >
            Save & Continue ({routes.length})
          </button>

          {/* Routes list */}
          {routes.length > 0 && (
            <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Click a route to select:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {routes.map((route, index) => {
                  const isSel = selectedIds.includes(route.id)
                  return (
                    <button
                      key={route.id}
                      onClick={() => {
                        selectRoute(route.id)
                        setSelectedRouteIndex(index)
                        setCurrentName(route.name)
                        setCurrentGrade(route.grade)
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors ${
                        isSel
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-gray-900 dark:text-yellow-100 border border-yellow-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isSel ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="flex-1 truncate">{route.name}</span>
                      <span className="text-xs opacity-70">{route.grade}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Routes count */}
          {routes.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              {routes.length} route{routes.length !== 1 ? 's' : ''} drawn
            </div>
          )}
        </div>
      </div>
    </div>
  )
}