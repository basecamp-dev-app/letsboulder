'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { RoutePoint } from '@/lib/useRouteSelection'
import { Loader2, Share2, ArrowLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ImageRoute {
  id: string
  points: RoutePoint[]
  color: string
  climb: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
}

export default function ImagePage() {
  const params = useParams()
  const router = useRouter()
  const imageId = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [image, setImage] = useState<ImageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<ImageRoute | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)

  useEffect(() => {
    const loadImage = async () => {
      if (!imageId) return

      try {
        const supabase = createClient()

        const { data: imageData, error: imageError } = await supabase
          .from('images')
          .select('id, url, latitude, longitude')
          .eq('id', imageId)
          .single()

        if (imageError) throw imageError

        const { data: routeLines, error: routeError } = await supabase
          .from('route_lines')
          .select(`
            id,
            points,
            color,
            climb:climb_id (
              id,
              name,
              grade,
              description
            )
          `)
          .eq('image_id', imageId)

        if (routeError) throw routeError

        type RawRouteLine = {
          id: string
          points: RoutePoint[]
          color: string | null
          climb: Array<{
            id: string
            name: string | null
            grade: string | null
            description: string | null
          }>
        }

        const formattedRoutes: ImageRoute[] = (routeLines as RawRouteLine[] || []).map((rl) => ({
          id: rl.id,
          points: rl.points,
          color: rl.color || 'red',
          climb: {
            id: rl.climb[0]?.id || '',
            name: rl.climb[0]?.name,
            grade: rl.climb[0]?.grade,
            description: rl.climb[0]?.description
          }
        }))

        setImage({
          ...imageData,
          route_lines: formattedRoutes
        })

        const { data: { user } } = await supabase.auth.getUser()
        if (user && formattedRoutes.length > 0) {
          const climbIds = formattedRoutes.map(r => r.climb.id)
          const { data: logs } = await supabase
            .from('logs')
            .select('climb_id, status')
            .eq('user_id', user.id)
            .in('climb_id', climbIds)

          if (logs) {
            const logsMap: Record<string, string> = {}
            logs.forEach(log => {
              logsMap[log.climb_id] = log.status
            })
            setUserLogs(logsMap)
          }
        }
        } catch {
          console.error('Error loading image:')
          setError('Failed to load image')
      } finally {
        setLoading(false)
      }
    }

    loadImage()
  }, [imageId])

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

    if (points.length > 0) {
      ctx.fillStyle = color
      const lastPoint = points[points.length - 1]
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, 6, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [])

  useEffect(() => {
    if (!image || !imageLoaded || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = imageRef.current
    if (!img) return

    const container = canvas.parentElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const imageAspect = img.naturalWidth / img.naturalHeight
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

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const scaleX = displayWidth / img.naturalWidth
    const scaleY = displayHeight / img.naturalHeight

    image.route_lines.forEach((route) => {
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

  const handleLogClimb = async (climbId: string, status: 'flash' | 'top' | 'try') => {
    setLogging(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/auth?imageId=${imageId}`)
        return
      }

      const response = await fetch('/api/log-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          climbIds: [climbId],
          status
        })
      })

      if (!response.ok) throw new Error('Failed to log')

      setUserLogs(prev => ({ ...prev, [climbId]: status }))
      setToast(`Route logged as ${status}!`)
      setTimeout(() => setToast(null), 2000)
    } catch {
      console.error('Log error:')
      setToast('Failed to log route')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setLogging(false)
    }
  }

  const getShareUrl = () => {
    return window.location.href
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl())
      setShareToast('Link copied!')
      setTimeout(() => setShareToast(null), 2000)
    } catch {
      setShareToast('Failed to copy link')
      setTimeout(() => setShareToast(null), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Image not found'}</p>
          <button
            onClick={() => router.push('/map')}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      {shareToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg">
          {shareToast}
        </div>
      )}

      <div className="flex items-center gap-2 p-4 bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => router.back()}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">Routes on this image</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShareModalOpen(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        <div className="relative max-w-full max-h-[50vh]">
          <Image
            ref={imageRef}
            src={image.url}
            alt="Climbing routes"
            width={800}
            height={600}
            className="max-w-full max-h-[50vh] object-contain"
            onLoadingComplete={() => setImageLoaded(true)}
            priority
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-auto"
            style={{ touchAction: 'none' }}
            onClick={() => setSelectedRoute(null)}
          />
        </div>
      </div>

      <div className="bg-gray-900 border-t border-gray-800 p-4 max-h-[40vh] overflow-y-auto">
        {selectedRoute ? (
          <div>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p className="text-white text-lg font-semibold">
                  {selectedRoute.climb.name || 'Unnamed'}, {selectedRoute.climb.grade}
                </p>
              </div>
              <button
                onClick={() => setSelectedRoute(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ← Back to all routes
              </button>
            </div>

            <div className="flex gap-4 mb-3">
              {(['flash', 'top', 'try'] as const).map(status => (
                <label key={status} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`log-${selectedRoute.climb.id}`}
                    checked={userLogs[selectedRoute.climb.id] === status}
                    onChange={() => handleLogClimb(selectedRoute.climb.id, status)}
                    disabled={logging}
                    className="w-4 h-4"
                  />
                  <span className="text-sm capitalize text-gray-300">{status}</span>
                </label>
              ))}
            </div>

            {selectedRoute.climb.description && (
              <p className="text-gray-400 text-sm">
                {selectedRoute.climb.description}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-white text-lg font-semibold mb-3">
              {image.route_lines.length} route{image.route_lines.length !== 1 ? 's' : ''} on this image
            </p>
            
            {image.route_lines.length === 0 ? (
              <p className="text-gray-400 text-sm">No routes on this image yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {image.route_lines.map((route, index) => {
                  const isLogged = !!userLogs[route.climb.id]
                  return (
                    <button
                      key={route.id}
                      onClick={(e) => handleRouteClick(route, e)}
                      className={`p-3 rounded-lg text-left transition-colors ${
                        isLogged 
                          ? 'bg-green-900/30 border border-green-800' 
                          : 'bg-gray-800 border border-gray-700 hover:border-blue-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-100">
                          {route.climb.name || `Route ${index + 1}`}
                        </span>
                        <span className={`text-sm px-2 py-0.5 rounded ${
                          isLogged ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
                        }`}>
                          {route.climb.grade}
                        </span>
                      </div>
                      {isLogged && (
                        <p className="text-xs text-green-400 mt-1">Logged</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Share Image</DialogTitle>
            <DialogDescription className="text-gray-400">
              Share this image with your climbing routes
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800"
            >
              <Share2 className="w-6 h-6 text-gray-400" />
              <span className="text-sm">Copy Link</span>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShareModalOpen(false)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
