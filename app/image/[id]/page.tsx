
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { RoutePoint } from '@/lib/useRouteSelection'
import { Loader2, Flag } from 'lucide-react'
import FlagImageModal from '@/components/FlagImageModal'
import type { ClimbStatusResponse } from '@/lib/verification-types'
import { csrfFetch } from '@/hooks/useCsrf'
import RouteDetailModal from '@/app/image/components/RouteDetailModal'
import { getOfflineCragMeta, getOfflineImage } from '@/lib/offline/crag-pack'

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
  imageWidth?: number | null
  imageHeight?: number | null
  imageNaturalWidth?: number
  imageNaturalHeight?: number
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
  width?: number
  height?: number
  natural_width?: number | null
  natural_height?: number | null
}

function smoothSvgPath(points: RoutePoint[], width: number, height: number): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x * width} ${points[0].y * height} L ${points[1].x * width} ${points[1].y * height}`
  }
  
  let path = `M ${points[0].x * width} ${points[0].y * height}`
  
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2 * width
    const yc = (points[i].y + points[i + 1].y) / 2 * height
    path += ` Q ${points[i].x * width} ${points[i].y * height} ${xc} ${yc}`
  }
  
  const last = points[points.length - 1]
  path += ` Q ${last.x * width} ${last.y * height} ${last.x * width} ${last.y * height}`
  
  return path
}

interface ImageWrapperProps {
  url: string
  routeLines: ImageRoute[]
  selectedRoute: ImageRoute | null
  naturalWidth: number
  naturalHeight: number
  routeNumberById: Record<string, number>
  onSelectRoute: (routeId: string) => void
}

interface ImageRenderInfo {
  renderedX: number
  renderedY: number
  renderedWidth: number
  renderedHeight: number
}

function ImageWrapper({ url, routeLines, selectedRoute, naturalWidth, naturalHeight, routeNumberById, onSelectRoute }: ImageWrapperProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [imageInfo, setImageInfo] = useState<ImageRenderInfo | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const pinScale = useMemo(() => {
    if (!imageInfo) return 1
    const safeW = imageInfo.renderedWidth > 0 ? imageInfo.renderedWidth : 0
    const safeH = imageInfo.renderedHeight > 0 ? imageInfo.renderedHeight : 0
    if (!safeW || !safeH) return 1

    const scaleX = naturalWidth / safeW
    const scaleY = naturalHeight / safeH
    const scale = Math.max(scaleX, scaleY)
    return Number.isFinite(scale) && scale > 0 ? scale : 1
  }, [imageInfo, naturalWidth, naturalHeight])

  useEffect(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return

    const updateSize = () => {
      const rect = img.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setImgSize({ width: rect.width, height: rect.height })
      setImageInfo({
        renderedX: rect.left - containerRect.left,
        renderedY: rect.top - containerRect.top,
        renderedWidth: rect.width,
        renderedHeight: rect.height
      })
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(img)

    if (img.complete) {
      updateSize()
    }

    return () => observer.disconnect()
  }, [url, naturalWidth, naturalHeight])

  const getViewBoxWidth = () => {
    if (routeLines.length > 0 && routeLines[0]?.imageWidth) {
      return routeLines[0].imageWidth
    }
    return naturalWidth
  }

  const getViewBoxHeight = () => {
    if (routeLines.length > 0 && routeLines[0]?.imageHeight) {
      return routeLines[0].imageHeight
    }
    return naturalHeight
  }

  return (
    <div className="relative w-fit h-fit" ref={containerRef}>
      <img
        ref={imgRef}
        src={url}
        alt="Climbing routes"
        className="max-w-full max-h-[calc(100vh-140px)] object-contain block"
        onLoad={() => {
          const img = imgRef.current
          const container = containerRef.current
          if (img && container) {
            const rect = img.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            setImgSize({ width: rect.width, height: rect.height })
            setImageInfo({
              renderedX: rect.left - containerRect.left,
              renderedY: rect.top - containerRect.top,
              renderedWidth: rect.width,
              renderedHeight: rect.height
            })
          }
        }}
      />
      {imageInfo && (
        <svg
          className="absolute z-10"
          style={{
            left: imageInfo.renderedX,
            top: imageInfo.renderedY,
            width: imageInfo.renderedWidth,
            height: imageInfo.renderedHeight
          }}
          viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
        >

           {routeLines.map((route, index) => {
              const isSelected = selectedRoute?.id === route.id
              const color = isSelected ? '#00ff00' : (route.color || '#ff00ff')
              const strokeWidth = isSelected ? 5 : 3
              const startPoint = route.points[0]
              const number = routeNumberById[route.id] ?? index + 1

              const digitCount = String(number).length
              const basePinRadiusPx = digitCount >= 3 ? 14 : digitCount === 2 ? 13 : 12
              const baseFontPx = digitCount >= 3 ? 11 : 12

              const pinRadius = basePinRadiusPx * pinScale
              const pinFontSize = baseFontPx * pinScale
              const pinHitRadius = Math.max(18, basePinRadiusPx + 7) * pinScale

            // Routes are already normalized to natural dimensions
            // No scaling needed since viewBox matches natural dimensions
            const scaledPoints = route.points



             const d = smoothSvgPath(scaledPoints, naturalWidth, naturalHeight)

             return (
               <g key={route.id}>
                 <path
                   d={d}
                   stroke="transparent"
                   strokeWidth={22}
                   fill="none"
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   pointerEvents="stroke"
                   style={{ cursor: 'pointer' }}
                   onClick={() => onSelectRoute(route.id)}
                 />
                  <path
                    d={d}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                  {startPoint && (
                    <>
                      <circle
                        cx={startPoint.x * naturalWidth}
                        cy={startPoint.y * naturalHeight}
                        r={pinHitRadius}
                        fill="transparent"
                        pointerEvents="all"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSelectRoute(route.id)}
                      />
                      <circle
                        cx={startPoint.x * naturalWidth}
                        cy={startPoint.y * naturalHeight}
                        r={pinRadius}
                        fill="#dc2626"
                        pointerEvents="none"
                      />
                      <text
                        x={startPoint.x * naturalWidth}
                        y={startPoint.y * naturalHeight}
                        fill="white"
                        fontSize={pinFontSize}
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        pointerEvents="none"
                      >
                        {number}
                     </text>
                   </>
                 )}
               </g>
             )
           })}
        </svg>
      )}
    </div>
  )
}

export default function ImagePage() {
  const params = useParams()
  const imageId = params.id as string
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedRouteId = searchParams.get('route')
  const selectedTab = searchParams.get('tab') === 'tops' ? 'tops' : 'climb'

  const [image, setImage] = useState<ImageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [cragId, setCragId] = useState<string | null>(null)
  const [cragName, setCragName] = useState<string | null>(null)
  const [climbStatus, setClimbStatus] = useState<ClimbStatusResponse | null>(null)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const [userHasFlagged, setUserHasFlagged] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [showAllRoutes, setShowAllRoutes] = useState(false)

  const selectedRoute = useMemo(() => {
    if (!image) return null
    if (!selectedRouteId) return null
    return image.route_lines.find((r) => r.id === selectedRouteId) || null
  }, [image, selectedRouteId])

  const routeNumberById = useMemo(() => {
    const m: Record<string, number> = {}
    if (!image?.route_lines) return m
    image.route_lines.forEach((r, idx) => {
      m[r.id] = idx + 1
    })
    return m
  }, [image?.route_lines])

  const lastStatusClimbIdRef = useRef<string | null>(null)

  const routesPreviewLimit = 10
  const authRedirectTo = selectedRouteId
    ? `/image/${imageId}?route=${selectedRouteId}&tab=${selectedTab}`
    : `/image/${imageId}`

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
    let cancelled = false

    const loadFromOffline = async () => {
      try {
        const rec = await getOfflineImage(imageId)
        if (!rec) return false

        const meta = await getOfflineCragMeta(rec.cragId)
        if (cancelled) return true

        setImage({
          id: rec.imageId,
          url: rec.url,
          latitude: rec.latitude,
          longitude: rec.longitude,
          width: rec.width ?? undefined,
          height: rec.height ?? undefined,
          natural_width: rec.natural_width,
          natural_height: rec.natural_height,
          route_lines: rec.route_lines as unknown as ImageRoute[],
        })
        setCragId(rec.cragId)
        setCragName(meta?.name || null)
        setError(null)
        setLoading(false)
        return true
      } catch {
        return false
      }
    }

    const loadImage = async () => {
      if (!imageId) return
      setLoading(true)
      setError(null)

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const ok = await loadFromOffline()
        if (ok) return
      }

      try {
        const supabase = createClient()

        const { data: imageData, error: imageError } = await supabase
          .from('images')
          .select('id, url, latitude, longitude, crag_id, width, height, natural_width, natural_height')
          .eq('id', imageId)
          .single()

        if (imageError) throw imageError

        let cragName = null
        if (imageData.crag_id) {
          const { data: cragData } = await supabase.from('crags').select('name').eq('id', imageData.crag_id).single()
          cragName = cragData?.name
        }

        const { data: routeLines, error: routeError } = await supabase
          .from('route_lines')
          .select(
            `
            id,
            points,
            color,
            climb_id,
            image_width,
            image_height,
            sequence_order,
            created_at,
            climbs (
              id,
              name,
              grade,
              description
            )
          `
          )
          .eq('image_id', imageId)
          .order('sequence_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (routeError) throw routeError

        type RawRouteLine = {
          id: string
          points: RoutePoint[]
          color: string | null
          climb_id: string
          image_width: number | null
          image_height: number | null
          sequence_order: number | null
          created_at: string | null
          climbs: {
            id: string
            name: string | null
            grade: string | null
            description: string | null
          } | null
        }

        const formattedRoutes: ImageRoute[] = ((routeLines as unknown as RawRouteLine[]) || []).map((rl) => ({
          id: rl.id,
          points: rl.points,
          color: rl.color || '#ff00ff',
          imageWidth: rl.image_width,
          imageHeight: rl.image_height,
          climb: {
            id: rl.climbs?.id || rl.climb_id || '',
            name: (rl.climbs?.name || '').trim() || null,
            grade: (rl.climbs?.grade || '').trim() || null,
            description: (rl.climbs?.description || '').trim() || null,
          },
        }))

        if (cancelled) return

        setImage({
          ...imageData,
          route_lines: formattedRoutes,
        })
        setCragId(imageData.crag_id)
        setCragName(cragName || null)

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user && formattedRoutes.length > 0) {
          const climbIds = formattedRoutes.map((r) => r.climb?.id).filter((id): id is string => id != null)
          const { data: logs } = await supabase
            .from('user_climbs')
            .select('climb_id, style')
            .eq('user_id', user.id)
            .in('climb_id', climbIds)

          if (logs) {
            const logsMap: Record<string, string> = {}
            logs.forEach((log) => {
              logsMap[log.climb_id] = log.style
            })
            setUserLogs(logsMap)
          }
        }

        await checkFlagStatus(imageId)
      } catch (err) {
        console.error('Error loading image:', err)
        const ok = await loadFromOffline()
        if (!ok && !cancelled) setError('Failed to load image')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadImage()

    return () => {
      cancelled = true
    }
  }, [imageId])

  useEffect(() => {
    setShowAllRoutes(false)
  }, [imageId])

  useEffect(() => {
    if (!image || !selectedRouteId) return
    const idx = image.route_lines.findIndex((r) => r.id === selectedRouteId)
    if (idx < 0) return
    if (idx >= routesPreviewLimit && !showAllRoutes) setShowAllRoutes(true)
  }, [image, selectedRouteId, routesPreviewLimit, showAllRoutes])

  const selectRouteById = (routeId: string) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set('route', routeId)
    next.set('tab', 'climb')
    router.push(`/image/${imageId}?${next.toString()}`)

    setClimbStatus(null)
    const route = image?.route_lines.find((r) => r.id === routeId) || null
    if (route?.climb?.id) {
      lastStatusClimbIdRef.current = route.climb.id
      fetchClimbStatus(route.climb.id)
    }
  }

  const handleRouteClick = (route: ImageRoute, event: React.MouseEvent) => {
    event.stopPropagation()
    selectRouteById(route.id)
  }

  async function fetchClimbStatus(climbId: string) {
    try {
      setStatusLoading(true)
      const response = await csrfFetch(`/api/climbs/${climbId}/status`)
      if (response.ok) {
        const status = await response.json()
        setClimbStatus(status)
      }
    } catch {
      console.error('Failed to fetch climb status')
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    const climbId = selectedRoute?.climb?.id || null
    if (!climbId) {
      setClimbStatus(null)
      lastStatusClimbIdRef.current = null
      return
    }

    if (lastStatusClimbIdRef.current === climbId) return
    lastStatusClimbIdRef.current = climbId
    setClimbStatus(null)
    fetchClimbStatus(climbId)
  }, [selectedRoute?.climb?.id])

  const checkFlagStatus = async (imgId: string) => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      const response = await csrfFetch(`/api/images/${imgId}/flags`)
      if (response.ok) {
        const data = await response.json()
        setUserHasFlagged(data.user_has_flagged)
      }
    } catch {
      console.error('Failed to check flag status')
    }
  }

  const handleLogClimb = async (climbId: string, style: 'flash' | 'top' | 'try'): Promise<boolean> => {
    setLogging(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = `/auth?imageId=${imageId}`
        return false
      }

      const response = await csrfFetch('/api/log-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          climbIds: [climbId],
          style
        })
      })

      if (!response.ok) throw new Error('Failed to log')

      const route = image?.route_lines.find(r => r.climb?.id === climbId)

      setUserLogs(prev => ({ ...prev, [climbId]: style }))
      setToast(`Route logged as ${style}!`)
      setTimeout(() => setToast(null), 2000)
      return true
    } catch (err) {
      console.error('Log error:', err)
      setToast('Failed to log route')
      setTimeout(() => setToast(null), 2000)
      return false
    } finally {
      setLogging(false)
    }
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
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Image not found'}</p>
          <button
            onClick={() => window.location.href = '/map'}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[7000] bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <ImageWrapper
          url={image.url}
          routeLines={image.route_lines}
          selectedRoute={selectedRoute}
          naturalWidth={image.natural_width || image.width || 800}
          naturalHeight={image.natural_height || image.height || 600}
          routeNumberById={routeNumberById}
          onSelectRoute={selectRouteById}
        />
      </div>

      {selectedRoute && selectedRoute.climb?.id && selectedRouteId && (
        <RouteDetailModal
          route={selectedRoute}
          tab={selectedTab}
          onTabChange={(nextTab) => {
            const next = new URLSearchParams(searchParams.toString())
            next.set('route', selectedRouteId)
            next.set('tab', nextTab)
            router.replace(`/image/${imageId}?${next.toString()}`)
          }}
          onClose={() => {
            router.push(`/image/${imageId}`)
          }}
          climbStatus={climbStatus}
          statusLoading={statusLoading}
          onRefreshStatus={async () => {
            if (selectedRoute?.climb?.id) {
              await fetchClimbStatus(selectedRoute.climb.id)
            }
          }}
          user={user}
          userLogStyle={selectedRoute.climb?.id ? userLogs[selectedRoute.climb.id] : undefined}
          logging={logging}
          onLog={async (style) => {
            if (!selectedRoute?.climb?.id) return false
            return await handleLogClimb(selectedRoute.climb.id, style)
          }}
          redirectTo={`/image/${imageId}?route=${selectedRouteId}&tab=${selectedTab}`}
        />
      )}

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-end mb-3">
          {image.route_lines.length > routesPreviewLimit && (
            <button
              onClick={() => setShowAllRoutes((v) => !v)}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
            >
              {showAllRoutes ? `Collapse routes` : `Show all routes (${image.route_lines.length})`}
            </button>
          )}
        </div>

        {image.route_lines.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">No routes on this image yet.</p>
        ) : (
          <div className={showAllRoutes ? 'max-h-[45vh] overflow-y-auto pr-1' : ''}>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {(showAllRoutes ? image.route_lines : image.route_lines.slice(0, routesPreviewLimit)).map((route, index) => {
                const isLogged = route.climb?.id ? !!userLogs[route.climb.id] : false
                const isSelected = selectedRoute?.id === route.id
                const routeNumber = routeNumberById[route.id] ?? index + 1
                return (
                  <button
                    key={route.id}
                    onClick={(e) => handleRouteClick(route, e)}
                    className={`p-3 rounded-lg text-left transition-colors border ${
                      isSelected
                        ? 'bg-gray-50 dark:bg-gray-950 border-gray-900 dark:border-white'
                        : isLogged
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'
                          : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold tabular-nums shadow-sm shrink-0 ${
                          isSelected
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                            : 'bg-white/90 text-gray-900 dark:bg-gray-800/80 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                        }`}>
                          {routeNumber}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {(route.climb?.name || '').trim() || `Route ${routeNumber}`}
                        </span>
                      </span>
                      <span className={`text-sm px-2 py-0.5 rounded ${
                        isLogged
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {route.climb?.grade}
                      </span>
                    </div>
                    {isLogged && (
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">Logged</p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-2 mt-3 pb-1">
          {cragId && cragName && (
            <Link
              href={`/crag/${cragId}`}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              View {cragName} →
            </Link>
          )}

          {!user ? (
            <button
              onClick={() => router.push(`/auth?redirect_to=${encodeURIComponent(authRedirectTo)}`)}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
            >
              <Flag className="w-3 h-3" />
              Flag
            </button>
          ) : userHasFlagged ? (
            <span className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-lg flex items-center gap-1">
              <Flag className="w-3 h-3" />
              Flagged
            </span>
          ) : (
            <button
              onClick={() => setFlagModalOpen(true)}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
            >
              <Flag className="w-3 h-3" />
              Flag
            </button>
          )}
        </div>
      </div>

      {flagModalOpen && (
        <FlagImageModal
          imageId={imageId}
          imageUrl={image.url}
          onClose={() => setFlagModalOpen(false)}
          onSubmitted={() => {
            setUserHasFlagged(true)
            checkFlagStatus(imageId)
          }}
        />
      )}
    </div>
  )
}
