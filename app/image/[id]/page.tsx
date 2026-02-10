
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { RoutePoint } from '@/lib/useRouteSelection'
import { Loader2, Flag } from 'lucide-react'
import FlagImageModal from '@/components/FlagImageModal'
import type { ClimbStatusResponse } from '@/lib/verification-types'
import { csrfFetch } from '@/hooks/useCsrf'
import RouteDetailModal from '@/app/image/components/RouteDetailModal'
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
    route_type: string | null
  } | null
  imageWidth?: number | null
  imageHeight?: number | null
  imageNaturalWidth?: number
  imageNaturalHeight?: number
}

interface ImageData {
  id: string
  url: string
  created_by?: string | null
  latitude: number | null
  longitude: number | null
  face_direction?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null
  route_lines: ImageRoute[]
  width?: number
  height?: number
  natural_width?: number | null
  natural_height?: number | null
}

interface PublicSubmitter {
  id: string
  displayName: string
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
}

interface ImageRenderInfo {
  renderedX: number
  renderedY: number
  renderedWidth: number
  renderedHeight: number
}

function ImageWrapper({ url, routeLines, selectedRoute, naturalWidth, naturalHeight }: ImageWrapperProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const [imageInfo, setImageInfo] = useState<ImageRenderInfo | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
          className="absolute pointer-events-none z-10"
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
            const strokeWidth = isSelected ? 3 : 2
            const startPoint = route.points[0]

            // Routes are already normalized to natural dimensions
            // No scaling needed since viewBox matches natural dimensions
            const scaledPoints = route.points



            return (
              <g key={route.id}>
                <path
                  d={smoothSvgPath(scaledPoints, naturalWidth, naturalHeight)}
                  stroke={color}
                  strokeWidth={strokeWidth + 0.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {startPoint && (
                  <>
                    <circle
                      cx={startPoint.x * naturalWidth}
                      cy={startPoint.y * naturalHeight}
                      r={16}
                      fill="#dc2626"
                    />
                    <text
                      x={startPoint.x * naturalWidth}
                      y={startPoint.y * naturalHeight}
                      fill="white"
                      fontSize={12}
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {index + 1}
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
  const gradeSystem = useGradeSystem()
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
  const [cragHref, setCragHref] = useState<string | null>(null)
  const [climbStatus, setClimbStatus] = useState<ClimbStatusResponse | null>(null)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const [userHasFlagged, setUserHasFlagged] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [publicSubmitter, setPublicSubmitter] = useState<PublicSubmitter | null>(null)
  const [hasSubmitter, setHasSubmitter] = useState(false)

  const selectedRoute = useMemo(() => {
    if (!image) return null
    if (!selectedRouteId) return null
    return image.route_lines.find((r) => r.id === selectedRouteId) || null
  }, [image, selectedRouteId])

  const lastStatusClimbIdRef = useRef<string | null>(null)

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
    const loadImage = async () => {
      if (!imageId) return

      setLoading(true)
      setError(null)
      setClimbStatus(null)
      setPublicSubmitter(null)
      setHasSubmitter(false)
      lastStatusClimbIdRef.current = null

      try {
        const supabase = createClient()

        const [
          { data: imageData, error: imageError },
          { data: routeLines, error: routeError },
        ] = await Promise.all([
          supabase
            .from('images')
            .select('id, url, latitude, longitude, face_direction, crag_id, width, height, natural_width, natural_height, created_by')
            .eq('id', imageId)
            .single(),
          supabase
            .from('route_lines')
            .select(`
              id,
              points,
              color,
              climb_id,
              image_width,
              image_height,
              climbs (
                id,
                name,
                grade,
                description
              )
            `)
            .eq('image_id', imageId),
        ])

        if (imageError) throw imageError
        if (routeError) throw routeError

        type RawRouteLine = {
          id: string
          points: RoutePoint[]
          color: string | null
          climb_id: string
          image_width: number | null
          image_height: number | null
          climbs: {
            id: string
            name: string | null
            grade: string | null
            description: string | null
          } | null
        }

        const formattedRoutes: ImageRoute[] = (routeLines as unknown as RawRouteLine[] || []).map((rl) => ({
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
            route_type: (rl.climbs as unknown as { route_type?: string | null } | null)?.route_type ?? null,
          }
        }))

        setImage({
          ...imageData,
          route_lines: formattedRoutes
        })
        setCragId(imageData.crag_id)
        setCragName(null)
        setCragHref(imageData.crag_id ? `/crag/${imageData.crag_id}` : null)

        if (imageData.crag_id) {
          void supabase
            .from('crags')
            .select('name, slug, country_code')
            .eq('id', imageData.crag_id)
            .single()
            .then(({ data: cragData }) => {
              if (!cragData) return
              setCragName(cragData.name || null)
              setCragHref(
                cragData.slug && cragData.country_code
                  ? `/${cragData.country_code.toLowerCase()}/${cragData.slug}`
                  : `/crag/${imageData.crag_id}`
              )
            })
        }

        if (imageData.created_by) {
          setHasSubmitter(true)
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, display_name, first_name, last_name, is_public')
            .eq('id', imageData.created_by)
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
      } catch (err) {
        console.error('Error loading image:', err)
        setError('Failed to load image')
      } finally {
        setLoading(false)
      }
    }

    loadImage()
  }, [imageId])

  useEffect(() => {
    const loadUserLogs = async () => {
      if (!user || !image) {
        setUserLogs({})
        return
      }

      const climbIds = Array.from(new Set(
        image.route_lines
          .map((route) => route.climb?.id)
          .filter((climbId): climbId is string => !!climbId)
      ))

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

      if (!logs) {
        setUserLogs({})
        return
      }

      const logsMap: Record<string, string> = {}
      logs.forEach((log) => {
        logsMap[log.climb_id] = log.style
      })
      setUserLogs(logsMap)
    }

    loadUserLogs()
  }, [image, user])

  const fetchClimbStatus = useCallback(async (climbId: string) => {
    if (!user) {
      setClimbStatus(null)
      return
    }

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
  }, [user])

  const handleRouteClick = (route: ImageRoute, event: React.MouseEvent) => {
    event.stopPropagation()
    const next = new URLSearchParams(searchParams.toString())
    next.set('route', route.id)
    next.set('tab', 'climb')
    router.push(`/image/${imageId}?${next.toString()}`)

    setClimbStatus(null)
    if (route.climb?.id) {
      lastStatusClimbIdRef.current = route.climb.id
      fetchClimbStatus(route.climb.id)
    }
  }

  useEffect(() => {
    if (!user) {
      setClimbStatus(null)
      lastStatusClimbIdRef.current = null
      return
    }

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
  }, [fetchClimbStatus, selectedRoute?.climb?.id, user])

  const checkFlagStatus = useCallback(async (imgId: string) => {
    try {
      const response = await csrfFetch(`/api/images/${imgId}/flags`)
      if (response.status === 401) {
        setUserHasFlagged(false)
        return
      }

      if (response.ok) {
        const data = await response.json()
        setUserHasFlagged(data.user_has_flagged)
      }
    } catch {
      console.error('Failed to check flag status')
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setUserHasFlagged(false)
      return
    }

    checkFlagStatus(imageId)
  }, [checkFlagStatus, imageId, user])

  const handleLogClimb = async (climbId: string, style: 'flash' | 'top' | 'try'): Promise<boolean> => {
    setLogging(true)
    try {
      if (!user) {
        window.location.href = `/auth?redirect_to=${encodeURIComponent(authRedirectTo)}`
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

      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-950 px-2 py-2 sm:px-4 sm:py-4">
        {image.face_direction && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none rounded-md bg-black/70 text-white text-xs font-medium px-2.5 py-1.5">
            Faces: {image.face_direction}
          </div>
        )}
        <ImageWrapper
          url={image.url}
          routeLines={image.route_lines}
          selectedRoute={selectedRoute}
          naturalWidth={image.natural_width || image.width || 800}
          naturalHeight={image.natural_height || image.height || 600}
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
          imageUrl={image.url}
          naturalWidth={image.natural_width || image.width || 800}
          naturalHeight={image.natural_height || image.height || 600}
          routePoints={selectedRoute.points}
          routeColor={selectedRoute.color}
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

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-3 sm:p-4">
        {image.route_lines.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">No routes on this image yet.</p>
        ) : (
          <div className="max-h-[40dvh] overflow-y-auto pr-1 pb-[env(safe-area-inset-bottom,0px)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {image.route_lines.map((route, index) => {
                const isLogged = route.climb?.id ? !!userLogs[route.climb.id] : false
                const isSelected = selectedRoute?.id === route.id
                return (
                  <button
                    key={route.id}
                    onClick={(e) => handleRouteClick(route, e)}
                    className={`p-3.5 min-h-14 rounded-lg text-left transition-colors border active:scale-[0.99] ${
                      isSelected
                        ? 'bg-gray-50 dark:bg-gray-950 border-gray-900 dark:border-white'
                        : isLogged
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'
                          : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-6 h-6 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center ${
                          isSelected
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                            : 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {(route.climb?.name || '').trim() || `Route ${index + 1}`}
                        </span>
                      </div>
                      <span className={`text-sm px-2 py-0.5 rounded shrink-0 ${
                        isLogged
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {formatGradeForDisplay(route.climb?.grade, gradeSystem)}
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

        {hasSubmitter && (
          <div className="text-center mb-2">
            {publicSubmitter ? (
              <Link
                href={`/logbook/${publicSubmitter.id}`}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline underline-offset-2"
              >
                Submitted by {publicSubmitter.displayName}
              </Link>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Submitted by a community member</p>
            )}
          </div>
        )}

        <div className="flex justify-center gap-2 mt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)]">
          {cragId && cragName && cragHref && (
            <Link
              href={cragHref}
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
