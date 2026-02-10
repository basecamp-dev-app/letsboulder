'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { Share2, X } from 'lucide-react'
import { RoutePoint } from '@/lib/useRouteSelection'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

interface ImageRoute {
  id: string
  points: RoutePoint[]
  color: string
  climb: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
  } | null
}

interface ImageModalProps {
  image: ImageData | null
  onClose: () => void
  userLogs: Record<string, string>
  onLogClimb: (climbId: string, status: string) => void
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
}

export default function ImageModal({ image, onClose, userLogs, onLogClimb }: ImageModalProps) {
  const gradeSystem = useGradeSystem()
  useOverlayHistory({ open: Boolean(image), onClose, id: `image-modal-${image?.id ?? 'unknown'}` })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<ImageRoute | null>(null)

  const drawRoute = useCallback((ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, isLogged: boolean) => {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(isLogged ? [] : [8, 4])

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2
      const yc = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
    }

    ctx.quadraticCurveTo(
      points[points.length - 1].x,
      points[points.length - 1].y,
      points[points.length - 1].x,
      points[points.length - 1].y
    )
    ctx.stroke()
    ctx.setLineDash([])
  }, [])

  useEffect(() => {
    if (!image || !imageLoaded || !canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = imageRef.current
    
    // Get the actual rendered size of the image
    const naturalWidth = img.naturalWidth || 800
    const naturalHeight = img.naturalHeight || 600

    // Set canvas to match image size exactly
    canvas.width = naturalWidth
    canvas.height = naturalHeight
    
    // Style the canvas to match the image's display size
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.maxWidth = '100%'
    canvas.style.maxHeight = '100%'
    canvas.style.objectFit = 'contain'

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Points are stored as percentages (0-1) of the full image
    // Scale them to canvas coordinates
    const scaleX = naturalWidth
    const scaleY = naturalHeight

    image.route_lines.forEach((route) => {
      if (!route.climb) return
      
      const isSelected = selectedRoute?.id === route.id
      const isLogged = !!userLogs[route.climb.id]
      const color = isLogged ? '#22c55e' : (isSelected ? '#3b82f6' : route.color)
      const width = isSelected ? 4 : 3

      const scaledPoints = route.points.map(p => ({
        x: p.x * scaleX,
        y: p.y * scaleY
      }))

      drawRoute(ctx, scaledPoints, color, width, isLogged)
    })
  }, [image, imageLoaded, selectedRoute, userLogs, drawRoute])

  const handleRouteClick = (route: ImageRoute, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedRoute(selectedRoute?.id === route.id ? null : route)
  }

  if (!image) return null

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 z-[1000]" onClick={onClose} />
      
      <div className="fixed inset-0 z-[1001] pointer-events-none pt-12">
        <div className="absolute top-16 bottom-16 left-0 right-0 pointer-events-auto">
          <div className="relative w-full h-full flex items-center justify-center">
            <Image
              ref={imageRef}
              src={image.url}
              alt="Climbing routes"
              width={800}
              height={600}
              className="max-w-full max-h-full object-contain"
              onLoadingComplete={() => setImageLoaded(true)}
              priority
            />
            <canvas
              ref={canvasRef}
              className="absolute pointer-events-auto"
              style={{ touchAction: 'none' }}
              onClick={() => setSelectedRoute(null)}
            />
          </div>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          className="absolute top-16 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 z-[1002] hover:bg-opacity-70"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 p-4 pointer-events-auto max-h-[40vh] overflow-y-auto">
          {selectedRoute ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-black dark:text-white text-lg font-semibold">
                    {selectedRoute.climb?.name || 'Unnamed'}, {formatGradeForDisplay(selectedRoute.climb?.grade, gradeSystem)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRoute(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back to all routes
                </button>
              </div>

              <div className="flex gap-4 mt-3">
                {['flash', 'top', 'try'].map(status => (
                  <label key={status} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`log-${selectedRoute.climb?.id || ''}`}
                      checked={selectedRoute.climb ? userLogs[selectedRoute.climb.id] === status : false}
                      onChange={() => selectedRoute.climb && onLogClimb(selectedRoute.climb.id, status)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm capitalize text-gray-700 dark:text-gray-300">{status}</span>
                  </label>
                ))}
              </div>

              {selectedRoute.climb?.description && (
                <p className="text-gray-700 dark:text-gray-300 text-sm mt-2">
                  {selectedRoute.climb.description}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-black dark:text-white text-lg font-semibold mb-3">
                {image.route_lines.length} route{image.route_lines.length !== 1 ? 's' : ''} on this image
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {image.route_lines.map((route, index) => {
                  if (!route.climb) return null
                  const isLogged = !!userLogs[route.climb.id]
                  return (
                    <button
                      key={route.id}
                      onClick={(e) => handleRouteClick(route, e)}
                      className={`p-3 rounded-lg text-left transition-colors ${
                        isLogged 
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                          : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {route.climb.name || `Route ${index + 1}`}
                        </span>
                        <span className={`text-sm px-2 py-0.5 rounded ${
                          isLogged ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {formatGradeForDisplay(route.climb.grade, gradeSystem)}
                        </span>
                      </div>
                      {isLogged && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">Logged</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
