'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { findRouteAtPoint, RoutePoint, useRouteSelection } from '@/lib/useRouteSelection'
import { Share2, Twitter, Facebook, MessageCircle, Link2, Flag, Star } from 'lucide-react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/hooks/useCsrf'
import { SITE_URL } from '@/lib/site'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { formatSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/lib/submission-credit'
import type { GradeOpinion } from '@/lib/grade-feedback'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import ClimbPageSkeleton from '@/app/climb/components/ClimbPageSkeleton'
import FlagClimbModal from '@/components/FlagClimbModal'

const VideoBetaSection = dynamic(() => import('@/app/climb/components/VideoBetaSection'), {
  ssr: false,
})
const CommentThread = dynamic(() => import('@/components/comments/CommentThread'), {
  ssr: false,
})

interface ImageInfo {
  id: string
  url: string
  crag_id: string | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
}

interface PublicSubmitter {
  id: string
  displayName: string
  contributionCreditPlatform: string | null
  contributionCreditHandle: string | null
  profileContributionCreditPlatform: string | null
  profileContributionCreditHandle: string | null
}

interface ClimbInfo {
  id: string
  name: string
  grade: string
  route_type: string | null
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
  route_type?: string | null
  image_url: string
  coordinates: RoutePoint[] | string
}

interface UserLogEntry {
  style: string
  gradeOpinion: GradeOpinion | null
  starRating: number | null
}

interface SaveFeedbackResponse {
  gradeUpdated?: boolean
  updatedGrade?: string | null
}

interface StarRatingSummary {
  rating_avg: number | null
  rating_count: number
}

const GRADE_OPINION_LABELS: Record<GradeOpinion, string> = {
  soft: 'Soft',
  agree: 'Agree',
  hard: 'Hard',
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

function normalizeRouteType(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

function formatRouteTypeLabel(value: string): string {
  return normalizeRouteType(value)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getSubmissionCreditUrl(platform: string | null, handle: string | null): string | null {
  if (!handle) return null

  const normalizedPlatform = normalizeSubmissionCreditPlatform(platform)
  if (!normalizedPlatform) return null

  switch (normalizedPlatform) {
    case 'instagram':
      return `https://www.instagram.com/${handle}`
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`
    case 'youtube':
      return `https://www.youtube.com/@${handle}`
    case 'x':
      return `https://x.com/${handle}`
    case 'other':
      return null
    default:
      return null
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
  const routeLinesRef = useRef<DisplayRouteLine[]>([])
  const selectedIdsRef = useRef<string[]>([])
  const userLogsRef = useRef<Record<string, UserLogEntry>>({})
  const drawFrameRef = useRef<number | null>(null)

  const [image, setImage] = useState<ImageInfo | null>(null)
  const [routeLines, setRouteLines] = useState<DisplayRouteLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, UserLogEntry>>({})
  const [pendingGradeOpinion, setPendingGradeOpinion] = useState<GradeOpinion | null>(null)
  const [pendingStarRating, setPendingStarRating] = useState<number | null>(null)
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackCollapsedByClimbId, setFeedbackCollapsedByClimbId] = useState<Record<string, boolean>>({})
  const [starRatingSummaryByClimbId, setStarRatingSummaryByClimbId] = useState<Record<string, StarRatingSummary>>({})
  const [hasUserInteractedWithSelection, setHasUserInteractedWithSelection] = useState(false)
  const [publicSubmitter, setPublicSubmitter] = useState<PublicSubmitter | null>(null)
  const [cragPath, setCragPath] = useState<string | null>(null)
  const [showDeferredSections, setShowDeferredSections] = useState(false)
  const gradeSystem = useGradeSystem()

  useOverlayHistory({ open: shareModalOpen, onClose: () => setShareModalOpen(false), id: 'share-climb-dialog' })

  const { selectedIds, selectRoute, clearSelection } = useRouteSelection()

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
  const activeClimbId = displayClimb?.id || climbId
  const selectedClimb = selectedRoute?.climb || null
  const selectedClimbLog = selectedClimb ? userLogs[selectedClimb.id] : null
  const selectedClimbLogged = !!selectedClimbLog
  const selectedClimbHasSavedFeedback = !!(selectedClimbLog?.gradeOpinion || selectedClimbLog?.starRating)
  const selectedClimbFeedbackCollapsed = !!(selectedClimb && feedbackCollapsedByClimbId[selectedClimb.id])
  const selectedClimbRatingSummary = selectedClimb ? starRatingSummaryByClimbId[selectedClimb.id] : null
  const selectedClimbAverageRating = selectedClimbRatingSummary?.rating_avg ?? null
  const selectedClimbRoundedStars = selectedClimbAverageRating
    ? Math.max(0, Math.min(5, Math.round(selectedClimbAverageRating)))
    : 0
  const formattedContributionHandle = publicSubmitter
    ? formatSubmissionCreditHandle(
        publicSubmitter.contributionCreditHandle || publicSubmitter.profileContributionCreditHandle
      )
    : null
  const contributionCreditUrl = publicSubmitter
    ? getSubmissionCreditUrl(
        publicSubmitter.contributionCreditPlatform || publicSubmitter.profileContributionCreditPlatform,
        publicSubmitter.contributionCreditHandle || publicSubmitter.profileContributionCreditHandle
      )
    : null

  routeLinesRef.current = routeLines
  selectedIdsRef.current = selectedIds
  userLogsRef.current = userLogs

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
      setCragPath(null)
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
            image:images!inner(id, url, crag_id, width, height, natural_width, natural_height, created_by, contribution_credit_platform, contribution_credit_handle),
            climb:climbs!inner(id, name, grade, route_type, description)
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
            url: resolveRouteImageUrl(legacy.image_url),
            crag_id: null,
            width: null,
            height: null,
            natural_width: null,
            natural_height: null,
            created_by: null,
            contribution_credit_platform: null,
            contribution_credit_handle: null,
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
                route_type: legacy.route_type || null,
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

        if (imageInfo.crag_id) {
          const { data: cragData } = await supabase
            .from('crags')
            .select('id, country_code, slug')
            .eq('id', imageInfo.crag_id)
            .maybeSingle()

          if (cragData?.country_code && cragData?.slug) {
            setCragPath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
          } else {
            setCragPath(`/crag/${imageInfo.crag_id}`)
          }
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
            climbs (id, name, grade, route_type, description)
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
                route_type: climb.route_type,
                description: climb.description,
              },
            } as DisplayRouteLine
          })
          .filter((line): line is DisplayRouteLine => line !== null)

        if (mappedLines.length === 0) {
          throw new Error('No valid route lines found for this image')
        }

        setImage({
          ...imageInfo,
          url: resolveRouteImageUrl(imageInfo.url),
        })

        if (imageInfo.created_by) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, display_name, first_name, last_name, is_public, contribution_credit_platform, contribution_credit_handle')
            .eq('id', imageInfo.created_by)
            .single()

          if (profileData?.is_public) {
            const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim()
            const displayName = fullName || profileData.display_name || profileData.username || 'Climber'
            setPublicSubmitter({
              id: profileData.id,
              displayName,
              contributionCreditPlatform: imageInfo.contribution_credit_platform,
              contributionCreditHandle: imageInfo.contribution_credit_handle,
              profileContributionCreditPlatform: profileData.contribution_credit_platform,
              profileContributionCreditHandle: profileData.contribution_credit_handle,
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
    if (!cragPath) return
    router.prefetch(cragPath)
  }, [cragPath, router])

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
        .select('climb_id, style, grade_opinion, star_rating')
        .eq('user_id', user.id)
        .in('climb_id', climbIds)

      const nextLogs: Record<string, UserLogEntry> = {}
      for (const log of logs || []) {
        nextLogs[log.climb_id] = {
          style: log.style,
          gradeOpinion:
            log.grade_opinion === 'soft' || log.grade_opinion === 'agree' || log.grade_opinion === 'hard'
              ? log.grade_opinion
              : null,
          starRating: typeof log.star_rating === 'number' ? log.star_rating : null,
        }
      }
      setUserLogs(nextLogs)
    }

    loadUserLogs()
  }, [user, routeLines])

  useEffect(() => {
    if (routeLines.length === 0) return

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
  }, [routeLines, selectedRouteParam, selectedIds, hasUserInteractedWithSelection, selectRoute, climbId])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const liveRouteLines = routeLinesRef.current
    const liveSelectedIds = selectedIdsRef.current
    const liveUserLogs = userLogsRef.current

    if (!canvas || liveRouteLines.length === 0) return
    if (canvas.width <= 0 || canvas.height <= 0) return

    const imageElement = imageRef.current
    if (!imageElement || !imageElement.complete || imageElement.naturalWidth === 0 || imageElement.naturalHeight === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const route of liveRouteLines) {
      const isLogged = !!liveUserLogs[route.climb.id]
      const isSelected = liveSelectedIds.includes(route.id)
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
  }, [])

  const scheduleDraw = useCallback(() => {
    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current)
    }

    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null
      draw()
    })
  }, [draw])

  useEffect(() => {
    scheduleDraw()
  }, [routeLines, selectedIds, userLogs, scheduleDraw])

  useEffect(() => {
    return () => {
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current)
      }
    }
  }, [])

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

      scheduleDraw()
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
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current)
        drawFrameRef.current = null
      }
      observer?.disconnect()
    }
  }, [image?.url, routeLines.length, scheduleDraw])

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
        return
      }

      updateRouteParam(clickedRoute.id)
    },
    [routeLines, updateRouteParam]
  )

  const getAuthRedirectPath = useCallback(() => {
    return selectedRoute
      ? `/climb/${climbId}?route=${selectedRoute.id}`
      : `/climb/${climbId}`
  }, [selectedRoute, climbId])

  const handleOpenFlagModal = () => {
    if (!selectedClimb) return

    if (!user) {
      router.push(`/auth?redirect_to=${encodeURIComponent(getAuthRedirectPath())}`)
      return
    }

    setFlagModalOpen(true)
  }

  const loadStarRatingSummary = useCallback(async (targetClimbId: string) => {
    try {
      const response = await fetch(`/api/climbs/${targetClimbId}/star-rating`)
      if (!response.ok) return
      const data = (await response.json()) as StarRatingSummary
      setStarRatingSummaryByClimbId((prev) => ({
        ...prev,
        [targetClimbId]: {
          rating_avg: typeof data.rating_avg === 'number' ? data.rating_avg : null,
          rating_count: typeof data.rating_count === 'number' ? data.rating_count : 0,
        },
      }))
    } catch {
      // no-op: summary is non-critical UI
    }
  }, [])

  useEffect(() => {
    setShowDeferredSections(false)
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null
    const scheduleShow = () => setShowDeferredSections(true)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(scheduleShow, { timeout: 1200 })
    } else {
      timeoutId = setTimeout(scheduleShow, 350)
    }

    return () => {
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [climbId])

  useEffect(() => {
    if (!selectedClimb) {
      setPendingGradeOpinion(null)
      setPendingStarRating(null)
      return
    }

    const feedback = userLogs[selectedClimb.id]
    setPendingGradeOpinion(feedback?.gradeOpinion ?? null)
    setPendingStarRating(feedback?.starRating ?? null)

    setFeedbackCollapsedByClimbId((prev) => {
      if (prev[selectedClimb.id] !== undefined) {
        return prev
      }
      return {
        ...prev,
        [selectedClimb.id]: !!(feedback?.gradeOpinion || feedback?.starRating),
      }
    })
  }, [selectedClimb, userLogs])

  useEffect(() => {
    if (!selectedClimb) return
    if (starRatingSummaryByClimbId[selectedClimb.id]) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null
    const run = () => {
      if (cancelled) return
      void loadStarRatingSummary(selectedClimb.id)
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 900 })
    } else {
      timeoutId = setTimeout(run, 250)
    }

    return () => {
      cancelled = true
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [selectedClimb, starRatingSummaryByClimbId, loadStarRatingSummary])

  const handleSaveFeedback = async () => {
    if (!selectedClimb || !selectedClimbLogged || savingFeedback) return

    setSavingFeedback(true)
    try {
      const response = await csrfFetch('/api/user-climbs/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          climbId: selectedClimb.id,
          gradeOpinion: pendingGradeOpinion,
          starRating: pendingStarRating,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save feedback')
      }

      const data = (await response.json()) as SaveFeedbackResponse

      setUserLogs((prev) => ({
        ...prev,
        [selectedClimb.id]: {
          style: prev[selectedClimb.id]?.style || 'top',
          gradeOpinion: pendingGradeOpinion,
          starRating: pendingStarRating,
        },
      }))

      if (data.gradeUpdated && data.updatedGrade) {
        setRouteLines((prev) =>
          prev.map((route) =>
            route.climb.id === selectedClimb.id
              ? { ...route, climb: { ...route.climb, grade: data.updatedGrade! } }
              : route
          )
        )
      }

      setFeedbackCollapsedByClimbId((prev) => ({
        ...prev,
        [selectedClimb.id]: true,
      }))
      void loadStarRatingSummary(selectedClimb.id)

      if (data.gradeUpdated && data.updatedGrade) {
        const displayGrade = formatGradeForDisplay(data.updatedGrade, gradeSystem)
        setToast(`Saved. Community consensus updated this climb to ${displayGrade}.`)
      } else {
        setToast('Saved feedback')
      }
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      console.error('Feedback save error:', err)
      setToast('Failed to save feedback')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setSavingFeedback(false)
    }
  }

  const handleLog = async (style: 'flash' | 'top' | 'try') => {
    if (!selectedClimb || selectedClimbLogged) return

    setLogging(true)
    try {
      const supabase = createClient()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        router.push(`/auth?redirect_to=${encodeURIComponent(getAuthRedirectPath())}`)
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

      setUserLogs((prev) => ({
        ...prev,
        [selectedClimb.id]: {
          style,
          gradeOpinion: prev[selectedClimb.id]?.gradeOpinion ?? null,
          starRating: prev[selectedClimb.id]?.starRating ?? null,
        },
      }))
      setPendingGradeOpinion(null)
      setPendingStarRating(null)
      setFeedbackCollapsedByClimbId((prev) => ({
        ...prev,
        [selectedClimb.id]: false,
      }))
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
    return <ClimbPageSkeleton />
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Climb not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Map
          </button>
        </div>
      </div>
    )
  }

  const displayClimbTypeLabel = displayClimb?.route_type ? formatRouteTypeLabel(displayClimb.route_type) : null

  const routeSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: displayClimb?.name || 'Climbing route',
    description: displayClimb?.grade
      ? `${displayClimb.grade}${displayClimbTypeLabel ? ` ${displayClimbTypeLabel.toLowerCase()}` : ''} route`
      : 'Climbing route',
    url: `${SITE_URL}/climb/${climbId}`,
    image: image.url,
    sport: displayClimbTypeLabel || 'Climbing',
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
          <Image
            ref={imageRef}
            src={image.url}
            alt={displayClimb?.name || 'Climbing routes'}
            width={1600}
            height={1200}
            sizes="(max-width: 768px) 100vw, 1200px"
            fetchPriority="high"
            unoptimized
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
                {selectedClimb
                  ? `Grade: ${formatGradeForDisplay(selectedClimb.grade, gradeSystem)}`
                  : 'Tap a route on the image to select it'}
              </p>
              {selectedClimb?.route_type && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Type: {formatRouteTypeLabel(selectedClimb.route_type)}
                </p>
              )}
              {selectedClimb && (
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {selectedClimbRatingSummary
                    ? selectedClimbRatingSummary.rating_count > 0
                      ? (
                          <div className="flex items-center gap-2">
                            <span>{selectedClimbAverageRating?.toFixed(1) || '0.0'}</span>
                            <div className="flex items-center gap-0.5" aria-label="Community star rating">
                              {[1, 2, 3, 4, 5].map((value) => {
                                const active = value <= selectedClimbRoundedStars
                                return (
                                  <Star
                                    key={value}
                                    className={`w-4 h-4 ${
                                      active
                                        ? 'fill-amber-400 text-amber-500'
                                        : 'text-gray-300 dark:text-gray-600'
                                    }`}
                                  />
                                )
                              })}
                            </div>
                            <span>({selectedClimbRatingSummary.rating_count})</span>
                          </div>
                        )
                      : 'Community rating: No ratings yet'
                    : 'Community rating: Loading...'}
                </div>
              )}
              {selectedClimb?.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedClimb.description}</p>
              )}
              {publicSubmitter && (
                <>
                  {formattedContributionHandle && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Credit to{' '}
                      {contributionCreditUrl ? (
                        <a
                          href={contributionCreditUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-gray-400 underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          {formattedContributionHandle}
                        </a>
                      ) : (
                        <span>{formattedContributionHandle}</span>
                      )}
                    </p>
                  )}
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
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {cragPath && (
                <Link
                  href={cragPath}
                  className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  View crag
                </Link>
              )}
              <button
                onClick={handleOpenFlagModal}
                disabled={!selectedClimb}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Report incorrect route info"
                title={selectedClimb ? 'Report incorrect route info' : 'Select a route to report'}
              >
                <Flag className="w-5 h-5" />
              </button>
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
                    router.push(`/auth?redirect_to=${encodeURIComponent(getAuthRedirectPath())}`)
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

          {selectedClimbLogged && selectedClimb && (
            <div className="space-y-3">
              {selectedClimbFeedbackCollapsed ? (
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">Saved</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Grade feel:{' '}
                        {selectedClimbLog?.gradeOpinion
                          ? GRADE_OPINION_LABELS[selectedClimbLog.gradeOpinion]
                          : 'Not set'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFeedbackCollapsedByClimbId((prev) => ({ ...prev, [selectedClimb.id]: false }))}
                      className="text-xs font-medium px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="flex items-center gap-1 mt-3">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = (selectedClimbLog?.starRating ?? 0) >= value
                      return (
                        <Star
                          key={value}
                          className={`w-4 h-4 ${
                            active
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      )
                    })}
                    {!selectedClimbLog?.starRating && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">No star rating yet</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">How did the grade feel?</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Current grade: {formatGradeForDisplay(selectedClimb.grade, gradeSystem)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {([
                      { value: 'soft', label: 'Soft' },
                      { value: 'agree', label: 'Agree' },
                      { value: 'hard', label: 'Hard' },
                    ] as Array<{ value: GradeOpinion; label: string }>).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPendingGradeOpinion(option.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          pendingGradeOpinion === option.value
                            ? 'border-gray-900 dark:border-gray-100 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">Rate the climb</p>
                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = (pendingStarRating ?? 0) >= value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPendingStarRating(value)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-5 h-5 ${
                              active
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
                        </button>
                      )
                    })}
                    {pendingStarRating && (
                      <button
                        type="button"
                        onClick={() => setPendingStarRating(null)}
                        className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleSaveFeedback}
                    disabled={savingFeedback || (!pendingGradeOpinion && !pendingStarRating)}
                    className="mt-4 w-full px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    {savingFeedback ? 'Saving...' : selectedClimbHasSavedFeedback ? 'Update Feedback' : 'Save Feedback'}
                  </button>
                </div>
              )}

              <button
                onClick={() => router.push('/logbook')}
                className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                View Logbook
              </button>
            </div>
          )}

          {showDeferredSections && image.id && !image.id.startsWith('legacy-') && (
            <VideoBetaSection climbId={activeClimbId} />
          )}

          {showDeferredSections && image.id && !image.id.startsWith('legacy-') && (
            <CommentThread targetType="image" targetId={image.id} userId={user?.id || null} className="mt-6" />
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

      {flagModalOpen && selectedClimb && (
        <FlagClimbModal
          climbId={selectedClimb.id}
          climbName={selectedClimb.name}
          onClose={() => setFlagModalOpen(false)}
          onSubmitted={() => {
            setToast('Flag submitted. An admin will review it soon.')
            setTimeout(() => setToast(null), 3000)
          }}
        />
      )}
    </div>
  )
}
