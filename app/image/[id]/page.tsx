'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { RoutePoint } from '@/lib/useRouteSelection'
import { Loader2, Share2, CheckCircle, AlertCircle, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import GradeVoting from '@/components/GradeVoting'
import CorrectionSection from '@/components/CorrectionSection'
import type { ClimbStatusResponse } from '@/lib/verification-types'
import { trackEvent, trackClimbLogged } from '@/lib/posthog'

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

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
  width?: number
  height?: number
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
}

function ImageWrapper({ url, routeLines, selectedRoute }: ImageWrapperProps) {
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const updateSize = () => {
      const rect = img.getBoundingClientRect()
      setImgSize({ width: rect.width, height: rect.height })
    }

    // Use ResizeObserver to track size changes
    const observer = new ResizeObserver(updateSize)
    observer.observe(img)

    // Initial size after load
    if (img.complete) {
      updateSize()
    }

    return () => observer.disconnect()
  }, [url])

  return (
    <div className="relative w-fit h-fit">
      <img
        ref={imgRef}
        src={url}
        alt="Climbing routes"
        className="max-w-full max-h-[calc(100vh-300px)] object-contain block"
        onLoad={() => {
          const img = imgRef.current
          if (img) {
            const rect = img.getBoundingClientRect()
            setImgSize({ width: rect.width, height: rect.height })
          }
        }}
      />
      {imgSize && (
        <svg
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
          style={{ width: imgSize.width, height: imgSize.height }}
          viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
          preserveAspectRatio="none"
        >
          {routeLines.map((route) => {
            const isSelected = selectedRoute?.id === route.id
            const color = isSelected ? '#00ff00' : (route.color || '#ff00ff')
            const strokeWidth = isSelected ? 3 : 2
            
            return (
              <g key={route.id}>
                <path
                  d={smoothSvgPath(route.points, imgSize.width, imgSize.height)}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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

  const [image, setImage] = useState<ImageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<ImageRoute | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [cragId, setCragId] = useState<string | null>(null)
  const [cragName, setCragName] = useState<string | null>(null)
  const [climbStatus, setClimbStatus] = useState<ClimbStatusResponse | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/auth?redirect_to=/image/${imageId}`)
      }
    }
    checkAuth()
  }, [imageId, router])

  useEffect(() => {
    const loadImage = async () => {
      if (!imageId) return

      try {
        const supabase = createClient()

        const { data: imageData, error: imageError } = await supabase
          .from('images')
          .select('id, url, latitude, longitude, crag_id, width, height')
          .eq('id', imageId)
          .single()

        if (imageError) throw imageError

        let cragName = null
        if (imageData.crag_id) {
          const { data: cragData } = await supabase
            .from('crags')
            .select('name')
            .eq('id', imageData.crag_id)
            .single()
          cragName = cragData?.name
        }

        const { data: routeLines, error: routeError } = await supabase
          .from('route_lines')
          .select(`
            id,
            points,
            color,
            climb_id,
            climbs (
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
          climb_id: string
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
          climb: {
            id: rl.climbs?.id || rl.climb_id || '',
            name: (rl.climbs?.name || '').trim() || null,
            grade: (rl.climbs?.grade || '').trim() || null,
            description: (rl.climbs?.description || '').trim() || null
          }
        }))

        setImage({
          ...imageData,
          route_lines: formattedRoutes
        })
        setCragId(imageData.crag_id)
        setCragName(cragName || null)

        trackEvent('route_image_viewed', {
          image_id: imageId,
          route_count: formattedRoutes.length,
          has_crag: !!imageData.crag_id,
          crag_name: cragName,
        })

        const { data: { user } } = await supabase.auth.getUser()
        if (user && formattedRoutes.length > 0) {
          const climbIds = formattedRoutes.map(r => r.climb?.id).filter((id): id is string => id != null)
          const { data: logs } = await supabase
            .from('user_climbs')
            .select('climb_id, style')
            .eq('user_id', user.id)
            .in('climb_id', climbIds)

          if (logs) {
            const logsMap: Record<string, string> = {}
            logs.forEach(log => {
              logsMap[log.climb_id] = log.style
            })
            setUserLogs(logsMap)
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

  const handleRouteClick = (route: ImageRoute, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedRoute(selectedRoute?.id === route.id ? null : route)
    if (selectedRoute?.id !== route.id) {
      setClimbStatus(null)
      if (route.climb?.id) {
        fetchClimbStatus(route.climb.id)
      }
    }
  }

  const fetchClimbStatus = async (climbId: string) => {
    try {
      const response = await fetch(`/api/climbs/${climbId}/status`)
      if (response.ok) {
        const status = await response.json()
        setClimbStatus(status)
      }
    } catch {
      console.error('Failed to fetch climb status')
    }
  }

  const handleVerify = async () => {
    if (!selectedRoute || !climbStatus) return
    setVerificationLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = `/auth?imageId=${imageId}`
        return
      }

      const method = climbStatus.user_has_verified ? 'DELETE' : 'POST'
      if (selectedRoute.climb?.id) {
        const response = await fetch(`/api/climbs/${selectedRoute.climb.id}/verify`, {
          method
        })

        if (response.ok) {
          fetchClimbStatus(selectedRoute.climb.id)
        }
      }
    } catch {
      setToast('Failed to update verification')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleLogClimb = async (climbId: string, style: 'flash' | 'top' | 'try') => {
    setLogging(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = `/auth?imageId=${imageId}`
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

      const route = image?.route_lines.find(r => r.climb?.id === climbId)
      trackClimbLogged(
        climbId,
        route?.climb?.name || 'Unknown',
        route?.climb?.grade || 'Unknown',
        style
      )

      setUserLogs(prev => ({ ...prev, [climbId]: style }))
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

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
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
            onClick={() => window.location.href = '/map'}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col pt-12">
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

      <div className="sticky top-0 z-40 flex items-center gap-2 p-4 bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => window.location.href = '/map'}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Close and go to map"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">Routes on this image</h1>
        {cragId && cragName && (
          <Link
            href={`/crag/${cragId}`}
            className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            View {cragName} →
          </Link>
        )}
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

      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-gray-950">
        <ImageWrapper url={image.url} routeLines={image.route_lines} selectedRoute={selectedRoute} />
      </div>

      <div className="bg-gray-900 border-t border-gray-800 p-4 max-h-[40vh] overflow-y-auto">
        {selectedRoute ? (
          <div>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  {climbStatus?.is_verified ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                  <p className="text-white text-lg font-semibold">
                    {selectedRoute.climb?.name || 'Unnamed'}, {selectedRoute.climb?.grade}
                  </p>
                </div>
                {climbStatus && (
                  <p className="text-xs text-gray-400 mt-1">
                    {climbStatus.verification_count}/3 verifications
                    {climbStatus.is_verified ? ' - Verified' : ' - Needs 3 to verify'}
                  </p>
                )}
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
                    name={`log-${selectedRoute.climb?.id}`}
                    checked={userLogs[selectedRoute.climb?.id || ''] === status}
                    onChange={() => selectedRoute.climb?.id && handleLogClimb(selectedRoute.climb.id, status)}
                    disabled={logging}
                    className="w-4 h-4"
                  />
                  <span className="text-sm capitalize text-gray-300">{status}</span>
                </label>
              ))}
            </div>

            {climbStatus && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                <button
                  onClick={handleVerify}
                  disabled={verificationLoading}
                  className={`w-full py-2 rounded-lg font-medium transition-colors ${
                    climbStatus.user_has_verified
                      ? 'bg-green-900/50 text-green-400 border border-green-700 hover:bg-green-900/70'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  {verificationLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : climbStatus.user_has_verified ? (
                    '✓ Verified (click to unverify)'
                  ) : (
                    'Verify this route'
                  )}
                </button>
              </div>
            )}

            {climbStatus && (
              <GradeVoting
                climbId={selectedRoute.climb?.id || ''}
                currentGrade={selectedRoute.climb?.grade || ''}
                votes={climbStatus.grade_votes}
                userVote={climbStatus.user_grade_vote}
                onVote={async () => { if (selectedRoute.climb?.id) fetchClimbStatus(selectedRoute.climb.id) }}
              />
            )}

            {selectedRoute.climb?.description && (
              <p className="text-gray-400 text-sm mt-4">
                {selectedRoute.climb.description}
              </p>
            )}

            {climbStatus && (
              <CorrectionSection
                climbId={selectedRoute.climb?.id || ''}
                corrections={climbStatus.corrections}
                onSubmitCorrection={async () => { if (selectedRoute.climb?.id) fetchClimbStatus(selectedRoute.climb.id) }}
                onVoteCorrection={async () => { if (selectedRoute.climb?.id) fetchClimbStatus(selectedRoute.climb.id) }}
              />
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
                  const isLogged = route.climb?.id ? !!userLogs[route.climb.id] : false
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
                          {(route.climb?.name || '').trim() || `Route ${index + 1}`}
                        </span>
                        <span className={`text-sm px-2 py-0.5 rounded ${
                          isLogged ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
                        }`}>
                          {route.climb?.grade}
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
