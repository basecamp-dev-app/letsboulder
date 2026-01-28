'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRouteSelection, RoutePoint, findRouteAtPoint } from '@/lib/useRouteSelection'
import { Loader2, Share2, Twitter, Facebook, MessageCircle, Link2 } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { SITE_URL } from '@/lib/site'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ClimbRoute {
  id: string
  name: string
  grade: string
  coordinates: RoutePoint[]
  image_url: string
  logged?: boolean
}

export default function ClimbPage() {
  const params = useParams()
  const router = useRouter()
  const climbId = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [climb, setClimb] = useState<ClimbRoute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string } | null>(null)

  useOverlayHistory({ open: shareModalOpen, onClose: () => setShareModalOpen(false), id: 'share-climb-dialog' })

  const { selectedIds, selectRoute, deselectRoute, isSelected, clearSelection } = useRouteSelection()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const loadClimb = async () => {
      if (!climbId) return

      try {
        const supabase = createClient()
        const { data: routeLine, error: routeLineError } = await supabase
          .from('route_lines')
          .select('image_id')
          .eq('climb_id', climbId)
          .single()

        if (!routeLineError && routeLine?.image_id) {
          router.replace(`/image/${routeLine.image_id}`)
          return
        }

        const { data, error } = await supabase
          .from('climbs')
          .select('id, name, grade, image_url, coordinates')
          .eq('id', climbId)
          .single()

        if (error) throw error

        const climbData = data as { id: string; name: string; grade: string; image_url: string; coordinates: RoutePoint[] | string }
        const coordinates = typeof climbData.coordinates === 'string'
          ? JSON.parse(climbData.coordinates)
          : climbData.coordinates

        setClimb({
          id: climbData.id,
          name: climbData.name,
          grade: climbData.grade,
          image_url: climbData.image_url,
          coordinates
        })

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: logs } = await supabase
            .from('user_climbs')
            .select('climb_id')
            .eq('user_id', user.id)
            .eq('climb_id', climbId)

          if (logs && logs.length > 0) {
            setClimb(prev => prev ? { ...prev, logged: true } : null)
          }
        }
      } catch (err) {
        console.error('Error loading climb:', err)
        setError('Failed to load climb')
      } finally {
        setLoading(false)
      }
    }

    loadClimb()
  }, [climbId, router])

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

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !climb) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const isLogged = climb.logged || false
    const isSelected = selectedIds.includes(climb.id)

    if (isSelected) {
      ctx.shadowColor = '#22c55e'
      ctx.shadowBlur = 15
      drawRoute(ctx, climb.coordinates, '#22c55e', 5, isLogged)
      ctx.shadowBlur = 0
    }

    drawRoute(ctx, climb.coordinates, isLogged ? '#22c55e' : '#ef4444', 3, isLogged)
  }, [climb, selectedIds, drawRoute])

  useEffect(() => {
    if (imageLoaded && climb) {
      draw()
    }
  }, [imageLoaded, climb, selectedIds, draw])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return

    const handleImageLoad = () => {
      const container = canvas.parentElement
      if (container) {
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
      }
      setImageLoaded(true)
    }

    if (image.complete) {
      handleImageLoad()
    } else {
      image.addEventListener('load', handleImageLoad)
    }

    return () => image.removeEventListener('load', handleImageLoad)
  }, [climb])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (!climb || climb.logged) return

    const canvas = canvasRef.current
    if (!canvas) return

    const canvasRect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - canvasRect.left
    const canvasY = e.clientY - canvasRect.top

    const imageX = canvasX
    const imageY = canvasY

    const routeForHitTest = {
      id: climb.id,
      points: climb.coordinates,
      grade: climb.grade,
      name: climb.name
    }

    const clickedRoute = findRouteAtPoint([routeForHitTest], { x: imageX, y: imageY }, 20)

    if (clickedRoute) {
      if (selectedIds.includes(clickedRoute.id)) {
        deselectRoute(clickedRoute.id)
      } else {
        selectRoute(clickedRoute.id)
      }
    }
  }, [climb, selectedIds, selectRoute, deselectRoute])

  const handleLog = async (style: 'flash' | 'top' | 'try') => {
    if (!climb || selectedIds.length === 0 && !climb.logged) return

    setLogging(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/auth?climbId=${climbId}`)
        return
      }

      const response = await fetch('/api/log-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          climbIds: [climbId],
          style
        })
      })

      if (!response.ok) throw new Error('Failed to log')

      setClimb(prev => prev ? { ...prev, logged: true } : null)
      clearSelection()
      setToast(`Route logged as ${style}!`)
      setTimeout(() => setToast(null), 2000)
    } catch (err) {
      console.error('Log error:', err)
      setToast('Failed to log route')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setLogging(false)
    }
  }

  const getShareMessage = () => {
    if (!climb) return ''
    const status = climb.logged ? 'I just completed' : 'I want to try'
    return `${status} "${climb.name}" (${climb.grade}) at this crag! 🧗`
  }

  const getShareUrl = () => {
    return window.location.href
  }

  const handleNativeShare = async () => {
    if (!climb) return
    try {
      await navigator.share({
        title: climb.name,
        text: getShareMessage(),
        url: getShareUrl()
      })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareModalOpen(true)
      }
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl())
      setShareToast('Link copied!')
      setTimeout(() => setShareToast(null), 2000)
    } catch (err) {
      setShareToast('Failed to copy link')
      setTimeout(() => setShareToast(null), 2000)
    }
  }

  const handleShareTwitter = () => {
    const url = encodeURIComponent(getShareUrl())
    const text = encodeURIComponent(getShareMessage())
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  const handleShareFacebook = () => {
    const url = encodeURIComponent(getShareUrl())
    const text = encodeURIComponent(getShareMessage())
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank')
  }

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`${getShareMessage()} ${getShareUrl()}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  if (error || !climb) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Climb not found'}</p>
          <button
            onClick={() => router.push('/map')}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  const routeSchema = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "name": climb.name,
    "description": `${climb.grade} bouldering route`,
    "url": `${SITE_URL}/climb/${climb.id}`,
    "image": climb.image_url,
    "sport": "Bouldering",
    "additionalProperty": {
      "@type": "PropertyValue",
      "name": "grade",
      "value": climb.grade
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(routeSchema) }}
      />
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

      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        <div className="relative">
          <img
            ref={imageRef}
            src={climb.image_url}
            alt={climb.name}
            className="max-w-full max-h-[60vh] object-contain"
          />
          <canvas
            ref={canvasRef}
            className={`absolute cursor-${climb.logged ? 'default' : 'pointer'}`}
            onClick={handleCanvasClick}
            style={{ pointerEvents: 'auto', touchAction: 'none' }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{climb.name}</h1>
              <p className="text-gray-600 dark:text-gray-400">Grade: {climb.grade}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={typeof navigator.share === 'function' ? handleNativeShare : () => setShareModalOpen(true)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Share climb"
              >
                <Share2 className="w-5 h-5" />
              </button>
              {climb.logged && (
                <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">
                  Logged
                </span>
              )}
            </div>
          </div>

          {!climb.logged && (
            <div className="space-y-3">
              {!user ? (
                <button
                  onClick={() => router.push(`/auth?redirect_to=/climb/${climbId}`)}
                  className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  Sign in to Log This Climb
                </button>
              ) : (
                <>
                  <p className="text-gray-400 text-sm">
                    {selectedIds.includes(climb.id)
                      ? 'Route selected - choose an option below'
                      : 'Click the route to select it'}
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleLog('flash')}
                      disabled={logging || !selectedIds.includes(climb.id)}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      ⚡ Flash
                    </button>
                    <button
                      onClick={() => handleLog('top')}
                      disabled={logging || !selectedIds.includes(climb.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => handleLog('try')}
                      disabled={logging || !selectedIds.includes(climb.id)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Try
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {climb.logged && (
            <button
              onClick={() => router.push('/logbook')}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              View Logbook
            </button>
          )}
        </div>
      </div>

      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Share Climb</DialogTitle>
            <DialogDescription className="text-gray-400">
              Share &ldquo;{climb?.name}&rdquo; with your friends
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3 py-4">
            <Button
              variant="outline"
              onClick={handleShareTwitter}
              className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800"
            >
              <Twitter className="w-6 h-6 text-blue-400" />
              <span className="text-xs">Twitter</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleShareFacebook}
              className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800"
            >
              <Facebook className="w-6 h-6 text-blue-600" />
              <span className="text-xs">Facebook</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleShareWhatsApp}
              className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800"
            >
              <MessageCircle className="w-6 h-6 text-green-500" />
              <span className="text-xs">WhatsApp</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800"
            >
              <Link2 className="w-6 h-6 text-gray-400" />
              <span className="text-xs">Copy</span>
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
