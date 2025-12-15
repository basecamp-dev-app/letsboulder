'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch'

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

export default function RouteCanvas({ imageUrl, latitude, longitude, sessionId }: RouteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [routes, setRoutes] = useState<RoutePoint[][]>([])
  const [currentPoints, setCurrentPoints] = useState<RoutePoint[]>([])
  const [imageLoaded, setImageLoaded] = useState(false)
  const [transformState, setTransformState] = useState({ scale: 1, positionX: 0, positionY: 0 })

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

    // Draw completed routes with curves
    routes.forEach(route => {
      if (route.length > 1) {
        drawCurve(ctx, route, 'red', 3)
      }
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

      // Draw connecting curve
      if (currentPoints.length > 1) {
        drawCurve(ctx, currentPoints, 'blue', 2, [5, 5])
      }
    }
  }, [routes, currentPoints])

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
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    // Adjust for zoom and pan
    x = (x - transformState.positionX) / transformState.scale
    y = (y - transformState.positionY) / transformState.scale

    setCurrentPoints(prev => [...prev, { x, y }])
  }, [transformState])

  const handleFinishRoute = () => {
    if (currentPoints.length > 1) {
      setRoutes(prev => [...prev, [...currentPoints]])
      setCurrentPoints([])
    }
  }

  const handleUndo = () => {
    if (routes.length > 0) {
      setRoutes(prev => prev.slice(0, -1))
    } else if (currentPoints.length > 0) {
      setCurrentPoints(prev => prev.slice(0, -1))
    }
  }

  const handleSave = () => {
    // Save routes to localStorage for now, redirect to naming
    const routeData = {
      imageUrl,
      latitude,
      longitude,
      routes,
      sessionId
    }
    localStorage.setItem('routeSession', JSON.stringify(routeData))
    window.location.href = `/name-routes?sessionId=${sessionId}`
  }

  const handleClearCurrent = () => {
    setCurrentPoints([])
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-4 border border-gray-300">
        <TransformWrapper
          initialScale={0.5}
          minScale={0.1}
          maxScale={5}
          centerOnInit={true}
          limitToBounds={false}
          onTransformed={(ref, state) => {
            setTransformState({
              scale: state.scale,
              positionX: state.positionX,
              positionY: state.positionY
            })
          }}
        >
          <TransformComponent>
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Climbing route"
              style={{ maxWidth: 'none', width: 'auto', height: 'auto' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 cursor-crosshair"
              onClick={handleCanvasClick}
              style={{ pointerEvents: 'auto' }}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
      <div className="flex gap-4 mb-4">
        <button onClick={handleFinishRoute} className="bg-green-500 text-white px-4 py-2 rounded" disabled={currentPoints.length < 2}>
          Finish Route
        </button>
        <button onClick={handleUndo} className="bg-yellow-500 text-white px-4 py-2 rounded">
          Undo Last
        </button>
        <button onClick={handleClearCurrent} className="bg-red-500 text-white px-4 py-2 rounded">
          Clear Current
        </button>
      </div>
      <button onClick={handleSave} className="bg-blue-500 text-white px-6 py-3 rounded">
        Save & Continue to Naming
      </button>
      <p className="mt-2 text-sm text-gray-600">
        Routes drawn: {routes.length} | Current points: {currentPoints.length}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Click on the image to add route points. Zoom and pan to navigate the full image.
      </p>
    </div>
  )
}