'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface RoutePoint {
  x: number
  y: number
}

interface RouteCanvasProps {
  imageUrl: string
  latitude: number
  longitude: number
  sessionId: string
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

export default function RouteCanvas({ imageUrl, latitude, longitude, sessionId }: RouteCanvasProps) {
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
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
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
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw completed routes with labels
    routes.forEach(route => {
      drawRouteWithLabels(ctx, route)
    })

    // Draw current points
    if (currentPoints.length > 0) {
      // Draw points
      ctx.fillStyle = 'blue'
      currentPoints.forEach(point => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fill()
      })

      // Draw connecting dotted curve
      if (currentPoints.length > 1) {
        drawCurve(ctx, currentPoints, 'blue', 2, [5, 5])
      }

      // Preview labels for current route
      if (currentPoints.length > 1 && currentGrade && currentName) {
        const previewRoute: RouteWithLabels = {
          points: currentPoints,
          grade: currentGrade,
          name: currentName
        }
        drawRouteWithLabels(ctx, previewRoute)
      }
    }
  }, [routes, currentPoints, currentGrade, currentName])

  const drawCurve = (ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, dash?: number[]) => {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    else ctx.setLineDash([])

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length; i++) {
      if (i < points.length - 1) {
        // Use quadratic curve for smooth connections
        const nextPoint = points[i + 1]
        const controlX = (points[i].x + nextPoint.x) / 2
        const controlY = (points[i].y + nextPoint.y) / 2
        ctx.quadraticCurveTo(points[i].x, points[i].y, controlX, controlY)
      } else {
        ctx.lineTo(points[i].x, points[i].y)
      }
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  const drawRouteWithLabels = (ctx: CanvasRenderingContext2D, route: RouteWithLabels) => {
    const { points, grade, name } = route

    // Draw dotted route line
    drawCurve(ctx, points, 'red', 3, [8, 4])

    if (points.length > 1) {
      // Calculate midpoint for grade
      const midIndex = Math.floor(points.length / 2)
      const gradePoint = points[midIndex]

      // Draw grade label
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'black'
      ctx.lineWidth = 2
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.strokeText(grade, gradePoint.x, gradePoint.y - 5)
      ctx.fillText(grade, gradePoint.x, gradePoint.y - 5)

      // Calculate end point for name (slightly offset)
      const lastPoint = points[points.length - 1]
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

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Check if click is within displayed image bounds
    const imageRect = image.getBoundingClientRect()
    const relativeX = e.clientX - imageRect.left
    const relativeY = e.clientY - imageRect.top

    if (relativeX < 0 || relativeX > imageRect.width || relativeY < 0 || relativeY > imageRect.height) {
      return // Click outside image, ignore
    }

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
    <div className="flex flex-col items-center">
      <div className="relative mb-4 border border-gray-300">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Climbing route"
          className="w-full h-auto rounded"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 cursor-crosshair"
          onClick={handleCanvasClick}
          style={{ pointerEvents: 'auto' }}
        />
      </div>
      <div className="flex flex-col gap-4 mb-4 w-full max-w-md">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Route name (optional)"
            value={currentName}
            onChange={(e) => setCurrentName(e.target.value)}
            className="flex-1 px-3 py-2 border rounded"
          />
          <select
            value={currentGrade}
            onChange={(e) => setCurrentGrade(e.target.value)}
            className="px-3 py-2 border rounded"
          >
            {Array.from({ length: 18 }, (_, i) => `V${i}`).map(grade => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleFinishRoute} className="bg-green-500 text-white px-4 py-2 rounded" disabled={currentPoints.length < 2}>
            Finish Route
          </button>
          {selectedRouteIndex !== null && (
            <button onClick={handleUpdateRoute} className="bg-purple-500 text-white px-4 py-2 rounded">
              Update Route
            </button>
          )}
          <button onClick={handleUndo} className="bg-yellow-500 text-white px-4 py-2 rounded" disabled={currentPoints.length === 0 && routes.length === 0}>
            Undo Last {currentPoints.length > 0 ? 'Point' : routes.length > 0 ? 'Route' : ''}
          </button>
          <button onClick={handleClearCurrent} className="bg-red-500 text-white px-4 py-2 rounded" disabled={currentPoints.length === 0 && selectedRouteIndex === null}>
            Clear Current
          </button>
        </div>
      </div>
      <button onClick={handleSave} className="bg-blue-500 text-white px-6 py-3 rounded" disabled={routes.length === 0}>
        Save & Continue to Naming ({routes.length} routes)
      </button>
      {routes.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h3 className="text-sm font-semibold mb-2">Finished Routes:</h3>
          <div className="space-y-2">
            {routes.map((route, index) => (
              <div key={index} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                selectedRouteIndex === index ? 'bg-blue-100 border border-blue-300' : 'bg-white hover:bg-gray-100'
              }`} onClick={() => handleSelectRoute(index)}>
                <span className="text-sm font-medium">{route.name}</span>
                <span className="text-xs text-gray-600">({route.grade})</span>
                <span className="text-xs text-gray-500">{route.points.length} points</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-sm text-gray-600">
        Routes drawn: {routes.length} | Current points: {currentPoints.length}
        {selectedRouteIndex !== null && ` | Editing: ${routes[selectedRouteIndex].name}`}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Click on the image to add route points. Press Enter or click "Finish Route" to complete each route. Use "Undo Last" to remove points/routes. Click on finished routes to edit them. When done, click "Save & Continue to Naming".
      </p>
    </div>
  )
}