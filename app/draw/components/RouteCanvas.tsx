'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface RoutePoint {
  x: number
  y: number
}

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

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const handleImageLoad = () => {
      // Size canvas to match the actual displayed image dimensions
      const container = canvas.parentElement
      if (container) {
        const containerRect = container.getBoundingClientRect()
        const containerAspect = containerRect.width / containerRect.height
        const imageAspect = image.naturalWidth / image.naturalHeight

        let displayWidth, displayHeight
        if (imageAspect > containerAspect) {
          // Image is wider than container - fit by width
          displayWidth = containerRect.width
          displayHeight = containerRect.width / imageAspect
        } else {
          // Image is taller than container - fit by height
          displayHeight = containerRect.height
          displayWidth = containerRect.height * imageAspect
        }

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
      drawRouteWithLabels(ctx, route, scaleX, scaleY)
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
        drawCurve(ctx, scaledCurrentPoints, 'blue', 2, [5, 5])
      }

      // Preview labels for current route
      if (scaledCurrentPoints.length > 1 && currentGrade && currentName) {
        const previewRoute: RouteWithLabels = {
          points: scaledCurrentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute)
      }
    }
   }, [routes, currentPoints, currentGrade, currentName, imageUrl])

  const drawCurve = (ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) => {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y) // Changed to simple lineTo
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels, scaleX = 1, scaleY = 1) => {
    const { points, grade, name } = route

    // Scale points to display size
    const scaledPoints = points.map(point => ({
      x: point.x * scaleX,
      y: point.y * scaleY
    }))

    // Draw dotted route line
    drawCurve(ctx, scaledPoints, 'red', 3, [8, 4])

    if (scaledPoints.length > 1) {
      // Calculate midpoint for grade
      const midIndex = Math.floor(scaledPoints.length / 2)
      const gradePoint = scaledPoints[midIndex]

      // Draw grade label
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'black'
      ctx.lineWidth = 2
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.strokeText(grade, gradePoint.x, gradePoint.y - 5)
      ctx.fillText(grade, gradePoint.x, gradePoint.y - 5)

      // Calculate end point for name (slightly offset)
      const lastPoint = scaledPoints[scaledPoints.length - 1]
      const nameX = lastPoint.x + 20
      const nameY = lastPoint.y + 15

      // Draw name label
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'black'
      ctx.lineWidth = 2
      ctx.font = '12px Arial'
      ctx.textAlign = 'left'
      ctx.strokeText(name, nameX, nameY)
      ctx.fillText(name, nameX, nameY)
    }
  }

  useEffect(() => {
    if (imageLoaded) redraw()
  }, [routes, currentPoints, imageLoaded, redraw])

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

    // Get click coordinates relative to canvas
    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - canvasRect.left
    const canvasY = e.clientY - canvasRect.top

    // Since canvas is now sized to match displayed image, coordinates are already in display space
    // Just validate they're within bounds
    if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
      return // Click outside canvas, ignore
    }

    // Scale coordinates from display size to natural image size
    const scaleX = image.naturalWidth / canvas.width
    const scaleY = image.naturalHeight / canvas.height
    const x = canvasX * scaleX
    const y = canvasY * scaleY

    setCurrentPoints(prev => [...prev, { x, y }])
  }, [])

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

    // Since canvas is now sized to match displayed image, coordinates are already in display space
    // Just validate they're within bounds
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

  const handleFinishRoute = useCallback(() => {
    console.log('Finish Route button clicked - Points:', currentPoints.length, 'Name:', currentName.trim())
    if (currentPoints.length > 1) {
      const routeName = currentName.trim() || `Route ${routes.length + 1}`
      console.log('Finishing route:', routeName, currentGrade, currentPoints.length, 'points')
      const newRoute: RouteWithLabels = {
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
    <div className="h-screen relative overflow-hidden">
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Climbing route"
        className="w-full h-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 cursor-crosshair w-full h-full"
        onClick={handleCanvasClick}
        onTouchEnd={handleCanvasTouch}
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
      />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-white bg-opacity-95 p-4 border-t">
        <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Route name (optional)"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              className="flex-1 px-3 py-2 border rounded text-sm"
            />
            <input
              type="text"
              placeholder="Grade"
              value={currentGrade}
              onChange={(e) => setCurrentGrade(e.target.value)}
              className="px-3 py-2 border rounded text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleFinishRoute} className="bg-green-500 text-white px-3 py-2 rounded text-sm" disabled={currentPoints.length < 2}>
              Finish Route
            </button>
            {selectedRouteIndex !== null && (
              <button onClick={handleUpdateRoute} className="bg-purple-500 text-white px-3 py-2 rounded text-sm">
                Update Route
              </button>
            )}
            <button onClick={handleUndo} className="bg-yellow-500 text-white px-3 py-2 rounded text-sm" disabled={currentPoints.length === 0 && routes.length === 0}>
              Undo Last {currentPoints.length > 0 ? 'Point' : routes.length > 0 ? 'Route' : ''}
            </button>
            <button onClick={handleClearCurrent} className="bg-red-500 text-white px-3 py-2 rounded text-sm" disabled={currentPoints.length === 0 && selectedRouteIndex === null}>
              Clear Current
            </button>
          </div>
          <button onClick={handleSave} className="bg-blue-500 text-white px-4 py-3 rounded w-full" disabled={routes.length === 0}>
            Save & Continue to Naming ({routes.length} routes)
          </button>
          {routes.length > 0 && (
            <div className="bg-gray-50 rounded p-3">
              <h3 className="text-sm font-semibold mb-2">Finished Routes:</h3>
              <div className="space-y-1">
                {routes.map((route, index) => (
                  <div key={index} className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${
                    selectedRouteIndex === index ? 'bg-blue-100 border border-blue-300' : 'bg-white hover:bg-gray-100'
                  }`} onClick={() => handleSelectRoute(index)}>
                    <span className="font-medium">{route.name}</span>
                    <span className="text-gray-600">({route.grade})</span>
                    <span className="text-gray-500">{route.points.length} points</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-gray-600 text-center">
            Routes drawn: {routes.length} | Current points: {currentPoints.length}
            {selectedRouteIndex !== null && ` | Editing: ${routes[selectedRouteIndex].name}`}
          </div>
        </div>
      </div>
    </div>
  )
}