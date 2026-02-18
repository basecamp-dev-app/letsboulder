'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { findRouteAtPoint, RoutePoint, useRouteSelection } from '@/lib/useRouteSelection'
import { Loader2, Share2, Twitter, Facebook, MessageCircle, Link2 } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/hooks/useCsrf'
import { SITE_URL } from '@/lib/site'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import CommentThread from '@/components/comments/CommentThread'

interface ImageInfo {
  id: string
  url: string
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
}

interface PublicSubmitter {
  id: string
  displayName: string
}

interface ClimbInfo {
  id: string
  name: string
  grade: string
  description: string | null
}

interface DisplayRouteLine {
  id: string
  points: RoutePoint[]
  color: string
  climb: ClimbInfo
}

interface SeedRouteResponse {
  id: string
  image_id: string | null
  points: RoutePoint[] | string | null
  image_width: number | null
  image_height: number | null
  image: ImageInfo | ImageInfo[] | null
  climb: ClimbInfo | ClimbInfo[] | null
}

interface RouteLineResponse {
  id: string
  points: RoutePoint[] | string | null
  color: string | null
  image_width: number | null
  image_height: number | null
  climb_id: string
  climbs: ClimbInfo | ClimbInfo[] | null
}

interface LegacyClimb {
  id: string
  name: string
  grade: string
  image_url: string
  coordinates: RoutePoint[] | string
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function parsePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  } catch {
    return []
  }
}

function normalizePoints(
  points: RoutePoint[],
  dims: {
    routeWidth: number | null
    routeHeight: number | null
    imageWidth: number | null
    imageHeight: number | null
  }
): RoutePoint[] {
  if (points.length < 2) return []

  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))
  if (maxX <= 1.2 && maxY <= 1.2) {
    return points.map((p) => ({
      x: Math.min(1, Math.max(0, p.x)),
      y: Math.min(1, Math.max(0, p.y)),
    }))
  }

  const baseWidth = dims.routeWidth || dims.imageWidth
  const baseHeight = dims.routeHeight || dims.imageHeight
  if (!baseWidth || !baseHeight || baseWidth <= 0 || baseHeight <= 0) return []

  return points
    .map((p) => ({ x: p.x / baseWidth, y: p.y / baseHeight }))
    .filter((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
}

function smoothCurveToCanvasPath(ctx: CanvasRenderingContext2D, points: RoutePoint[], width: number, height: number) {
  if (points.length < 2) return

  ctx.beginPath()
  ctx.moveTo(points[0]!.x * width, points[0]!.y * height)

  for (let i = 1; i < points.length - 1; i++) {
    const xc = ((points[i]!.x + points[i + 1]!.x) / 2) * width
    const yc = ((points[i]!.y + points[i + 1]!.y) / 2) * height
    ctx.quadraticCurveTo(points[i]!.x * width, points[i]!.y * height, xc, yc)
  }

  const last = points[points.length - 1]!
  ctx.quadraticCurveTo(last.x * width, last.y * height, last.x * width, last.y * height)
}

export default function ClimbPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const climbId = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [image, setImage] = useState<ImageInfo | null>(null)
  const [routeLines, setRouteLines] = useState<DisplayRouteLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [hasUserInteractedWithSelection, setHasUserInteractedWithSelection] = useState(false)
  const [publicSubmitter, setPublicSubmitter] = useState<PublicSubmitter | null>(null)

  useOverlayHistory({ open: shareModalOpen, onClose: () => setShareModalOpen(false), id: 'share-climb-dialog' })

  const { selectedIds, selectRoute, deselectRoute, clearSelection } = useRouteSelection()

  const selectedRouteParam = searchParams.get('route')

  const selectedRoute = useMemo(
    () => routeLines.find((route) => selectedIds.includes(route.id)) || null,
    [routeLines, selectedIds]
  )
  const defaultPathRoute = useMemo(
    () => routeLines.find((route) => route.climb.id === climbId) || routeLines[0] || null,
    [routeLines, climbId]
  )
  const displayRoute = selectedRoute || defaultPathRoute
  const displayClimb = displayRoute?.climb || null
  const selectedClimb = selectedRoute?.climb || null
  const selectedClimbLogged = !!(selectedClimb && userLogs[selectedClimb.id])

  const updateRouteParam = useCallback(
    (routeId: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (routeId) {
        next.set('route', routeId)
      } else {
        next.delete('route')
      }

      const query = next.toString()
      router.replace(query ? `/climb/${climbId}?${query}` : `/climb/${climbId}`, { scroll: false })
    },
    [searchParams, router, climbId]
  )

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)
    }

    getUser()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const loadClimbContext = async () => {
      if (!climbId) return

      setLoading(true)
      setError(null)
      setHasUserInteractedWithSelection(false)
      setPublicSubmitter(null)
      clearSelection()

      try {
        const supabase = createClient()
        const { data: seedRoute, error: seedError } = await supabase
          .from('route_lines')
          .select(`
            id,
            image_id,
            points,
            image_width,
            image_height,
            image:images!inner(id, url, width, height, natural_width, natural_height, created_by),
            climb:climbs!inner(id, name, grade, description)
          `)
          .eq('climb_id', climbId)
          .maybeSingle()

        if (seedError) throw seedError

        if (!seedRoute) {
          const { data: legacyClimb, error: legacyError } = await supabase
            .from('climbs')
            .select('id, name, grade, image_url, coordinates')
            .eq('id', climbId)
            .single()

          if (legacyError) throw legacyError

          const legacy = legacyClimb as LegacyClimb
          const parsedPoints = parsePoints(legacy.coordinates)
          const normalized = normalizePoints(parsedPoints, {
            routeWidth: null,
            routeHeight: null,
            imageWidth: null,
            imageHeight: null,
          })

          if (normalized.length < 2) {
            throw new Error('No valid route lines found for this climb')
          }

          setImage({
            id: `legacy-${legacy.id}`,
            url: legacy.image_url,
            width: null,
            height: null,
            natural_width: null,
            natural_height: null,
            created_by: null,
          })
          setRouteLines([
            {
              id: `legacy-${legacy.id}`,
              points: normalized,
              color: '#ef4444',
              climb: {
                id: legacy.id,
                name: legacy.name,
                grade: legacy.grade,
                description: null,
              },
            },
          ])
          return
        }

        const typedSeed = seedRoute as unknown as SeedRouteResponse
        const imageInfo = pickOne(typedSeed.image)
        const seedClimb = pickOne(typedSeed.climb)

        if (!imageInfo || !typedSeed.image_id || !seedClimb) {
          throw new Error('Climb image context not found')
        }

        const { data: allLines, error: allLinesError } = await supabase
          .from('route_lines')
          .select(`
            id,
            points,
            color,
            image_width,
            image_height,
            climb_id,
            climbs (id, name, grade, description)
          `)
          .eq('image_id', typedSeed.image_id)

        if (allLinesError) throw allLinesError

        const mappedLines = ((allLines as unknown as RouteLineResponse[]) || [])
          .map((line) => {
            const climb = pickOne(line.climbs)
            if (!climb) return null

            const normalized = normalizePoints(parsePoints(line.points), {
              routeWidth: line.image_width,
              routeHeight: line.image_height,
              imageWidth: imageInfo.natural_width || imageInfo.width,
              imageHeight: imageInfo.natural_height || imageInfo.height,
            })

            if (normalized.length < 2) return null

            return {
              id: line.id,
              points: normalized,
              color: line.color || '#ef4444',
              climb: {
                id: climb.id,
                name: climb.name,
                grade: climb.grade,
                description: climb.description,
              },
            } as DisplayRouteLine
          })
          .filter((line): line is DisplayRouteLine => line !== null)

        if (mappedLines.length === 0) {
          throw new Error('No valid route lines found for this image')
        }

        setImage(imageInfo)

        if (imageInfo.created_by) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, display_name, first_name, last_name, is_public')
            .eq('id', imageInfo.created_by)
            .single()

          if (profileData?.is_public) {
            const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim()
            const displayName = fullName || profileData.display_name || profileData.username || 'Climber'
            setPublicSubmitter({
              id: profileData.id,
              displayName,
            })
          }
        }

        setRouteLines(mappedLines)
      } catch (err) {
        console.error('Error loading climb:', err)
        setError('Failed to load climb')
      } finally {
        setLoading(false)
      }
    }

    loadClimbContext()
  }, [climbId, clearSelection])

  useEffect(() => {
    const loadUserLogs = async () => {
      if (!user || routeLines.length === 0) {
        setUserLogs({})
        return
      }

      const climbIds = Array.from(new Set(routeLines.map((route) => route.climb.id)))
      if (climbIds.length === 0) {
        setUserLogs({})
        return
      }

      const supabase = createClient()
      const { data: logs } = await supabase
        .from('user_climbs')
        .select('climb_id, style')
        .eq('user_id', user.id)
        .in('climb_id', climbIds)

      const nextLogs: Record<string, string> = {}
      for (const log of logs || []) {
        nextLogs[log.climb_id] = log.style
      }
      setUserLogs(nextLogs)
    }

    loadUserLogs()
  }, [user, routeLines])

  useEffect(() => {
    if (routeLines.length === 0) return

    const selectedStillExists = selectedIds.some((selectedId) => routeLines.some((route) => route.id === selectedId))
    if (selectedIds.length > 0 && !selectedStillExists) {
      clearSelection()
    }

    if (selectedRouteParam) {
      const exists = routeLines.some((route) => route.id === selectedRouteParam)
      if (exists && selectedIds[0] !== selectedRouteParam) {
        selectRoute(selectedRouteParam)
        return
      }
    }

    if (hasUserInteractedWithSelection) return
    if (selectedIds.length > 0) return

    const preselected = routeLines.find((route) => route.climb.id === climbId)
    if (preselected) {
      selectRoute(preselected.id)
    }
  }, [routeLines, selectedRouteParam, selectedIds, hasUserInteractedWithSelection, selectRoute, clearSelection, climbId])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || routeLines.length === 0) return
    if (canvas.width <= 0 || canvas.height <= 0) return

    const imageElement = imageRef.current
    if (!imageElement || !imageElement.complete || imageElement.naturalWidth === 0 || imageElement.naturalHeight === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const route of routeLines) {
      const isLogged = !!userLogs[route.climb.id]
      const isSelected = selectedIds.includes(route.id)
      const strokeWidth = isSelected ? 5 : 3
      const color = isSelected ? '#22c55e' : route.color

      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = isSelected ? 1 : 0.85
      ctx.setLineDash(isLogged ? [] : [8, 4])

      if (isSelected) {
        ctx.shadowColor = '#22c55e'
        ctx.shadowBlur = 14
      } else {
        ctx.shadowBlur = 0
      }

      smoothCurveToCanvasPath(ctx, route.points, canvas.width, canvas.height)
      ctx.stroke()

      const end = route.points[route.points.length - 1]
      if (end) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(end.x * canvas.width, end.y * canvas.height, isSelected ? 7 : 5, 0, 2 * Math.PI)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.setLineDash([])
  }, [routeLines, selectedIds, userLogs])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    const imageElement = imageRef.current
    if (!canvas || !imageElement) return

    const resizeCanvasToImage = () => {
      const container = canvas.parentElement
      if (!container || imageElement.naturalWidth === 0 || imageElement.naturalHeight === 0) return

      const containerRect = container.getBoundingClientRect()
      const imageAspect = imageElement.naturalWidth / imageElement.naturalHeight
      const containerAspect = containerRect.width / containerRect.height

      let displayWidth = 0
      let displayHeight = 0
      let offsetX = 0
      let offsetY = 0

      if (imageAspect > containerAspect) {
        displayWidth = containerRect.width
        displayHeight = containerRect.width / imageAspect
        offsetY = (containerRect.height - displayHeight) / 2
      } else {
        displayHeight = containerRect.height
        displayWidth = containerRect.height * imageAspect
        offsetX = (containerRect.width - displayWidth) / 2
      }

      const nextWidth = Math.max(1, Math.round(displayWidth))
      const nextHeight = Math.max(1, Math.round(displayHeight))

      canvas.style.left = `${offsetX}px`
      canvas.style.top = `${offsetY}px`

      if (canvas.width !== nextWidth) {
        canvas.width = nextWidth
      }

      if (canvas.height !== nextHeight) {
        canvas.height = nextHeight
      }

      requestAnimationFrame(draw)
    }

    const handleLoad = () => {
      resizeCanvasToImage()
    }

    if (imageElement.complete) {
      handleLoad()
    } else {
      imageElement.addEventListener('load', handleLoad)
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        resizeCanvasToImage()
      }
    }

    const handlePageShow = () => {
      resizeCanvasToImage()
    }

    const container = canvas.parentElement
    const observer = container ? new ResizeObserver(resizeCanvasToImage) : null
    if (container && observer) observer.observe(container)
    window.addEventListener('resize', resizeCanvasToImage)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      imageElement.removeEventListener('load', handleLoad)
      window.removeEventListener('resize', resizeCanvasToImage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      observer?.disconnect()
    }
  }, [image?.url, routeLines.length, draw])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas || routeLines.length === 0) return

      setHasUserInteractedWithSelection(true)

      const canvasRect = canvas.getBoundingClientRect()
      const canvasX = e.clientX - canvasRect.left
      const canvasY = e.clientY - canvasRect.top
      const normalizedPoint = {
        x: canvasX / canvas.width,
        y: canvasY / canvas.height,
      }

      const threshold = 20 / Math.max(1, Math.min(canvas.width, canvas.height))
      const clickedRoute = findRouteAtPoint(
        routeLines.map((route) => ({
          id: route.id,
          points: route.points,
          grade: route.climb.grade,
          name: route.climb.name,
        })),
        normalizedPoint,
        threshold
      )

      if (!clickedRoute) {
        clearSelection()
        updateRouteParam(null)
        return
      }

      if (selectedIds.includes(clickedRoute.id)) {
        deselectRoute(clickedRoute.id)
        updateRouteParam(null)
      } else {
        selectRoute(clickedRoute.id)
        updateRouteParam(clickedRoute.id)
      }
    },
    [routeLines, selectedIds, selectRoute, deselectRoute, clearSelection, updateRouteParam]
  )

  const handleLog = async (style: 'flash' | 'top' | 'try') => {
    if (!selectedClimb || selectedClimbLogged) return

    setLogging(true)
    try {
      const supabase = createClient()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        const redirectTo = selectedRoute
          ? `/climb/${climbId}?route=${selectedRoute.id}`
          : `/climb/${climbId}`
        router.push(`/auth?redirect_to=${encodeURIComponent(redirectTo)}`)
        return
      }

      const response = await csrfFetch('/api/log-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          climbIds: [selectedClimb.id],
          style,
        }),
      })

      if (!response.ok) throw new Error('Failed to log')

      setUserLogs((prev) => ({ ...prev, [selectedClimb.id]: style }))
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
    if (!displayClimb) return ''
    const isLogged = !!userLogs[displayClimb.id]
    const status = isLogged ? 'I just completed' : 'I want to try'
    return `${status} "${displayClimb.name}" (${displayClimb.grade}) at this crag! 🧗`
  }

  const getShareUrl = () => window.location.href

  const handleNativeShare = async () => {
    if (!displayClimb) return

    try {
      await navigator.share({
        title: displayClimb.name,
        text: getShareMessage(),
        url: getShareUrl(),
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
    } catch {
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

  if (error || !image) {
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
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: displayClimb?.name || 'Climbing route',
    description: displayClimb?.grade ? `${displayClimb.grade} bouldering route` : 'Bouldering route',
    url: `${SITE_URL}/climb/${climbId}`,
    image: image.url,
    sport: 'Bouldering',
    additionalProperty: displayClimb
      ? {
          '@type': 'PropertyValue',
          name: 'grade',
          value: displayClimb.grade,
        }
      : undefined,
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(routeSchema) }} />

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
            src={image.url}
            alt={displayClimb?.name || 'Climbing routes'}
            className="max-w-full max-h-[60vh] object-contain"
          />
          <canvas
            ref={canvasRef}
            className="absolute cursor-pointer"
            onClick={handleCanvasClick}
            style={{ pointerEvents: 'auto', touchAction: 'none' }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {selectedClimb ? selectedClimb.name : 'Select a route'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {selectedClimb ? `Grade: ${selectedClimb.grade}` : 'Tap a route on the image to select it'}
              </p>
              {selectedClimb?.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedClimb.description}</p>
              )}
              {publicSubmitter && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Submitted by{' '}
                  <Link
                    href={`/logbook/${publicSubmitter.id}`}
                    prefetch={false}
                    className="underline decoration-gray-400 underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    {publicSubmitter.displayName}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={typeof navigator.share === 'function' ? handleNativeShare : () => setShareModalOpen(true)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Share climb"
              >
                <Share2 className="w-5 h-5" />
              </button>
              {selectedClimbLogged && (
                <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">
                  Logged
                </span>
              )}
            </div>
          </div>

          {!selectedClimbLogged && (
            <div className="space-y-3">
              {!user ? (
                <button
                  onClick={() => {
                    const redirectTo = selectedRoute
                      ? `/climb/${climbId}?route=${selectedRoute.id}`
                      : `/climb/${climbId}`
                    router.push(`/auth?redirect_to=${encodeURIComponent(redirectTo)}`)
                  }}
                  className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  Sign in to Log This Climb
                </button>
              ) : (
                <>
                  <p className="text-gray-400 text-sm">
                    {selectedRoute ? 'Route selected - choose an option below' : 'Tap a route to select it'}
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleLog('flash')}
                      disabled={logging || !selectedClimb}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Flash
                    </button>
                    <button
                      onClick={() => handleLog('top')}
                      disabled={logging || !selectedClimb}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => handleLog('try')}
                      disabled={logging || !selectedClimb}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Try
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {selectedClimbLogged && (
            <button
              onClick={() => router.push('/logbook')}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              View Logbook
            </button>
          )}

          {image.id && !image.id.startsWith('legacy-') && (
            <CommentThread targetType="image" targetId={image.id} className="mt-6" />
          )}
        </div>
      </div>

      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Share Climb</DialogTitle>
            <DialogDescription className="text-gray-400">
              Share &ldquo;{displayClimb?.name || 'this climb'}&rdquo; with your friends
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
            <Button variant="ghost" onClick={() => setShareModalOpen(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
