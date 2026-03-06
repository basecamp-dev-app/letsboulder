'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import useEmblaCarousel from 'embla-carousel-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { findRouteAtPoint, RoutePoint, useRouteSelection } from '@/lib/useRouteSelection'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/hooks/useCsrf'
import { SITE_URL } from '@/lib/site'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { climbOfflinePackQueryKey, fetchClimbOfflinePack } from '@/lib/climb/queries'
import { deleteClimbOfflinePack, getOfflinePackStatus, saveClimbOfflinePack } from '@/lib/offline/packs'
import { runWhenIdle } from '@/lib/run-when-idle'
import { formatSubmissionCreditHandle, normalizeSubmissionCreditPlatform } from '@/lib/submission-credit'
import type { GradeOpinion } from '@/lib/grade-feedback'
import ClimbPageSkeleton from '@/app/climb/components/ClimbPageSkeleton'
import ClimbFaceViewer from '@/app/climb/components/ClimbFaceViewer'
import ClimbRouteRail from '@/app/climb/components/ClimbRouteRail'
import ClimbInfoPanel from '@/app/climb/components/ClimbInfoPanel'

const VideoBetaSection = dynamic(() => import('@/app/climb/components/VideoBetaSection'), {
  ssr: false,
})
const CommentThread = dynamic(() => import('@/components/comments/CommentThread'), {
  ssr: false,
})
const ClimbShareDialog = dynamic(() => import('@/app/climb/components/ClimbShareDialog'))
const ClimbOfflineDialog = dynamic(() => import('@/app/climb/components/ClimbOfflineDialog'))
const FlagClimbModal = dynamic(() => import('@/components/FlagClimbModal'), { ssr: false })

interface ImageInfo {
  id: string
  url: string
  crag_id: string | null
  width: number | null
  height: number | null
  natural_width: number | null
  natural_height: number | null
  created_by: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  face_directions: string[] | null
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
  imageId: string
  points: RoutePoint[]
  color: string
  climb: ClimbInfo
}

interface FaceGalleryItem {
  id: string
  index?: number
  image_id?: string | null
  is_primary: boolean
  url: string
  has_routes: boolean
  linked_image_id: string | null
  crag_image_id: string | null
  face_directions: string[] | null
  metadata?: {
    width: number | null
    height: number | null
  }
  routes?: FaceRouteSummary[]
}

interface FaceRouteSummary {
  id: string
  climb_id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
  color: string | null
  points: RoutePoint[] | string | null
  image_width: number | null
  image_height: number | null
  sequence_order: number | null
}

interface TransitionBuffer {
  faceId: string
  targetImageId: string
  targetImage: ImageInfo | null
  targetRoutes: DisplayRouteLine[] | null
  hasRoutes: boolean
  isLoading: boolean
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

interface PanOffset {
  x: number
  y: number
}

interface ViewerTouchState {
  mode: 'none' | 'pan' | 'pinch'
  startDistance: number
  startZoom: number
  startPan: PanOffset
  startTouch: { x: number; y: number } | null
}

const MIN_VIEWER_ZOOM = 1
const MAX_VIEWER_ZOOM = 3

const GRADE_OPINION_LABELS: Record<GradeOpinion, string> = {
  soft: 'Soft',
  agree: 'Agree',
  hard: 'Hard',
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

function getInitialViewerImageUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return ''
  return rawUrl
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function mapFaceRoutesToDisplayLines(
  routes: FaceRouteSummary[] | undefined,
  faceMeta: { width: number | null; height: number | null } | undefined,
  imageId: string
): DisplayRouteLine[] {
  if (!Array.isArray(routes) || routes.length === 0) return []

  return routes
    .map((route) => {
      const normalized = normalizePoints(parsePoints(route.points), {
        routeWidth: route.image_width,
        routeHeight: route.image_height,
        imageWidth: faceMeta?.width ?? null,
        imageHeight: faceMeta?.height ?? null,
      })

      if (normalized.length < 2) return null

      return {
        id: route.id,
        imageId,
        points: normalized,
        color: route.color || '#ef4444',
        climb: {
          id: route.climb_id,
          name: route.name,
          grade: route.grade,
          route_type: route.route_type,
          description: route.description,
        },
      } as DisplayRouteLine
    })
    .filter((line): line is DisplayRouteLine => line !== null)
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

interface ClimbPageClientProps {
  climbId: string
  enableCanonicalRedirect?: boolean
}

export default function ClimbPageClient({ climbId, enableCanonicalRedirect = false }: ClimbPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const viewerTransformRef = useRef<HTMLDivElement>(null)
  const routeLinesRef = useRef<DisplayRouteLine[]>([])
  const selectedIdsRef = useRef<string[]>([])
  const userLogsRef = useRef<Record<string, UserLogEntry>>({})
  const drawFrameRef = useRef<number | null>(null)
  const loadedFaceIdsRef = useRef<Set<string>>(new Set())
  const prefetchedFaceUrlsRef = useRef<Set<string>>(new Set())
  const routeCardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const suppressCanvasClickRef = useRef(false)
  const touchStateRef = useRef<ViewerTouchState>({
    mode: 'none',
    startDistance: 0,
    startZoom: MIN_VIEWER_ZOOM,
    startPan: { x: 0, y: 0 },
    startTouch: null,
  })

  const [image, setImage] = useState<ImageInfo | null>(null)
  const [routeLines, setRouteLines] = useState<DisplayRouteLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isApplyingClimbPack, setIsApplyingClimbPack] = useState(false)
  const [logging, setLogging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineActionLoading, setOfflineActionLoading] = useState(false)
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
  const [faceGallery, setFaceGallery] = useState<FaceGalleryItem[]>([])
  const [totalFaces, setTotalFaces] = useState(1)
  const [totalRoutesCombined, setTotalRoutesCombined] = useState(0)
  const [isFacesLoading, setIsFacesLoading] = useState(false)
  const [showDeferredSections, setShowDeferredSections] = useState(false)
  const [activeFaceIndex, setActiveFaceIndex] = useState(0)
  const [settledFaceIndex, setSettledFaceIndex] = useState(0)
  const [isFaceTransitioning, setIsFaceTransitioning] = useState(false)
  const [primaryImageId, setPrimaryImageId] = useState<string | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)
  const [loadedFaceVersion, setLoadedFaceVersion] = useState(0)
  const [activeCanvasImageId, setActiveCanvasImageId] = useState<string | null>(null)
  const [routeLinesImageId, setRouteLinesImageId] = useState<string | null>(null)
  const [canvasFadeOut, setCanvasFadeOut] = useState(false)
  const [transitionBuffer, setTransitionBuffer] = useState<TransitionBuffer | null>(null)
  const [savedOfflinePackVersion, setSavedOfflinePackVersion] = useState<string | null>(null)
  const [offlineUsageBytes, setOfflineUsageBytes] = useState(0)
  const [offlineBudgetBytes, setOfflineBudgetBytes] = useState(250 * 1024 * 1024)
  const [zoom, setZoom] = useState(MIN_VIEWER_ZOOM)
  const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 })
  const emblaDragEnabled = zoom <= MIN_VIEWER_ZOOM
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: 'x',
    watchDrag: emblaDragEnabled,
    loop: false,
    containScroll: 'trimSnaps',
    align: 'start',
  })
  const faceRouteCacheRef = useRef<Record<string, { image: ImageInfo; routeLines: DisplayRouteLine[] }>>({})
  const initialRouteCountRef = useRef(0)
  const prevActiveFaceIndexRef = useRef<number | null>(null)
  const gradeSystem = useGradeSystem()
  const { data: climbPackData, isLoading: isClimbPackLoading, error: climbPackError } = useQuery({
    queryKey: climbOfflinePackQueryKey(climbId),
    queryFn: () => fetchClimbOfflinePack(climbId),
    enabled: !!climbId,
    staleTime: 10 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    meta: {
      persist: true,
    },
  })

  useOverlayHistory({ open: shareModalOpen, onClose: () => setShareModalOpen(false), id: 'share-climb-dialog' })

  const { selectedIds, selectRoute, clearSelection } = useRouteSelection()

  const selectedRouteParam = searchParams.get('route')
  const [routeParamOverride, setRouteParamOverride] = useState<string | null>(null)
  const effectiveRouteParam = routeParamOverride ?? selectedRouteParam
  const hasNonRouteSearchParams = useMemo(() => {
    const entries = Array.from(searchParams.entries())
    return entries.some(([key]) => key !== 'route')
  }, [searchParams])

  const selectedRoute = useMemo(
    () => routeLines.find((route) => selectedIds.includes(route.id)) || null,
    [routeLines, selectedIds]
  )

  const visibleFaces = useMemo(() => {
    if (faceGallery.length > 0) return faceGallery
    if (!image?.url) return []
    return [{
      id: `image:${image.id}`,
      is_primary: true,
      url: image.url,
      has_routes: true,
      linked_image_id: image.id,
      crag_image_id: null,
      face_directions: image.face_directions ?? null,
    } satisfies FaceGalleryItem]
  }, [faceGallery, image])

  const markFaceLoaded = useCallback((faceId: string) => {
    if (loadedFaceIdsRef.current.has(faceId)) return
    loadedFaceIdsRef.current.add(faceId)
    setLoadedFaceVersion((value) => value + 1)
  }, [])

  const prefetchFaceImage = useCallback((face: FaceGalleryItem | undefined) => {
    if (!face?.url || typeof window === 'undefined') return
    if (prefetchedFaceUrlsRef.current.has(face.url)) return
    prefetchedFaceUrlsRef.current.add(face.url)
    const img = new window.Image()
    img.decoding = 'async'
    img.src = face.url
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {})
    }
  }, [])

  const updateEmblaControls = useCallback((syncSettled = false) => {
    if (!emblaApi) return
    const snap = emblaApi.selectedScrollSnap()
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
    setActiveFaceIndex(snap)
    if (syncSettled) {
      setSettledFaceIndex(snap)
    }
  }, [emblaApi])

  const clampPanForZoom = useCallback((nextPan: PanOffset, nextZoom: number): PanOffset => {
    if (nextZoom <= MIN_VIEWER_ZOOM) {
      return { x: 0, y: 0 }
    }

    const viewer = viewerTransformRef.current
    if (!viewer) return nextPan

    const baseWidth = viewer.offsetWidth
    const baseHeight = viewer.offsetHeight
    if (baseWidth <= 0 || baseHeight <= 0) return nextPan

    const maxX = ((nextZoom - MIN_VIEWER_ZOOM) * baseWidth) / 2
    const maxY = ((nextZoom - MIN_VIEWER_ZOOM) * baseHeight) / 2

    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    }
  }, [])

  const resetZoomPan = useCallback(() => {
    setZoom(MIN_VIEWER_ZOOM)
    setPan({ x: 0, y: 0 })
    touchStateRef.current = {
      mode: 'none',
      startDistance: 0,
      startZoom: MIN_VIEWER_ZOOM,
      startPan: { x: 0, y: 0 },
      startTouch: null,
    }
    suppressCanvasClickRef.current = false
  }, [])
  const defaultPathRoute = useMemo(
    () => routeLines.find((route) => route.climb.id === climbId) || routeLines[0] || null,
    [routeLines, climbId]
  )
  const displayRoute = selectedRoute || defaultPathRoute
  const displayClimb = displayRoute?.climb || null
  const displayRouteTapPoint = displayRoute && displayRoute.points.length > 0
    ? displayRoute.points[Math.floor(displayRoute.points.length / 2)]
    : null
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
      setRouteParamOverride(routeId)
      const next = new URLSearchParams(searchParams.toString())
      if (routeId) {
        next.set('route', routeId)
      } else {
        next.delete('route')
      }

      const query = next.toString()
      const relativeUrl = query ? `${pathname}?${query}` : pathname

      if (typeof window !== 'undefined') {
        window.history.replaceState(window.history.state, '', relativeUrl)
        return
      }

      router.replace(relativeUrl, { scroll: false })
    },
    [pathname, searchParams, router]
  )

  const scrollRouteCardIntoView = useCallback((routeId: string) => {
    const node = routeCardRefs.current[routeId]
    if (!node) return
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [])

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
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!climbId || !climbPackData) return

    let cancelled = false

    const applyClimbPack = async () => {
      setIsApplyingClimbPack(true)
      setError(null)
      setHasUserInteractedWithSelection(false)
      setPublicSubmitter(null)
      setCragPath(null)
      setFaceGallery([])
      setTotalFaces(1)
      setTotalRoutesCombined(0)
      setIsFacesLoading(false)
      setTransitionBuffer(null)
      setCanvasFadeOut(false)
      setActiveCanvasImageId(null)
      setRouteLinesImageId(null)
      setRouteParamOverride(null)
      resetZoomPan()
      loadedFaceIdsRef.current.clear()
      clearSelection()

      try {
        const primaryImageData = climbPackData.primary_image
        if (!climbPackData.climb?.id || !primaryImageData?.id) {
          throw new Error('Climb not found')
        }

        const primaryRouteLines = Array.isArray(climbPackData.primary_route_lines) ? climbPackData.primary_route_lines : []
        const faces = Array.isArray(climbPackData.faces)
          ? climbPackData.faces.filter((item) => typeof item?.url === 'string' && !!item.url) as FaceGalleryItem[]
          : []

        if (primaryImageData.id.startsWith('legacy-')) {
          const legacyLine = primaryRouteLines[0]
          const normalized = normalizePoints(parsePoints(legacyLine?.points), {
            routeWidth: null,
            routeHeight: null,
            imageWidth: null,
            imageHeight: null,
          })

          if (normalized.length < 2 || !legacyLine?.climb) {
            throw new Error('No valid route lines found for this climb')
          }

          if (cancelled) return
          setPrimaryImageId(primaryImageData.id)
          setActiveCanvasImageId(primaryImageData.id)
          setRouteLinesImageId(primaryImageData.id)
          setImage(primaryImageData)
          setRouteLines([
            {
              id: legacyLine.id,
              imageId: primaryImageData.id,
              points: normalized,
              color: legacyLine.color || '#ef4444',
              climb: legacyLine.climb,
            },
          ])
          setFaceGallery(faces)
          setTotalFaces(typeof climbPackData.summary?.total_faces === 'number' ? Math.max(1, climbPackData.summary.total_faces) : 1)
          setTotalRoutesCombined(typeof climbPackData.summary?.total_routes === 'number' ? climbPackData.summary.total_routes : 1)
          return
        }

        const mappedLines = primaryRouteLines
          .map((line) => {
            if (!line?.climb) return null
            const normalized = normalizePoints(parsePoints(line.points), {
              routeWidth: line.image_width,
              routeHeight: line.image_height,
              imageWidth: primaryImageData.natural_width || primaryImageData.width,
              imageHeight: primaryImageData.natural_height || primaryImageData.height,
            })
            if (normalized.length < 2) return null
            return {
              id: line.id,
              imageId: primaryImageData.id,
              points: normalized,
              color: line.color || '#ef4444',
              climb: line.climb,
            } as DisplayRouteLine
          })
          .filter((line): line is DisplayRouteLine => line !== null)

        if (mappedLines.length === 0) {
          throw new Error('No valid route lines found for this image')
        }

        const primaryImage: ImageInfo = {
          ...primaryImageData,
          url: getInitialViewerImageUrl(primaryImageData.url),
          face_directions: primaryImageData.face_directions ?? null,
        }

        if (cancelled) return
        setImage(primaryImage)
        setPrimaryImageId(primaryImage.id)
        setActiveCanvasImageId(primaryImage.id)
        setRouteLinesImageId(primaryImage.id)
        setActiveFaceIndex(0)
        setSettledFaceIndex(0)
        setRouteLines(mappedLines)
        initialRouteCountRef.current = mappedLines.length

        const nextCache: Record<string, { image: ImageInfo; routeLines: DisplayRouteLine[] }> = {
          [primaryImage.id]: {
            image: primaryImage,
            routeLines: mappedLines,
          },
        }

        const primaryBaseImage = primaryImage
        for (const face of faces) {
          const resolvedImageId = face.image_id || face.linked_image_id || (face.is_primary ? primaryImage.id : null)
          if (!resolvedImageId) continue

          const faceRoutes = mapFaceRoutesToDisplayLines(face.routes, face.metadata, resolvedImageId)
          const baseImage = nextCache[resolvedImageId]?.image
          const previousEntry = nextCache[resolvedImageId]

          const nextImage: ImageInfo = face.is_primary
            ? {
                id: resolvedImageId,
                url: face.url,
                crag_id: primaryBaseImage.crag_id || null,
                width: face.metadata?.width ?? primaryBaseImage.width ?? null,
                height: face.metadata?.height ?? primaryBaseImage.height ?? null,
                natural_width: face.metadata?.width ?? primaryBaseImage.natural_width ?? null,
                natural_height: face.metadata?.height ?? primaryBaseImage.natural_height ?? null,
                created_by: primaryBaseImage.created_by || null,
                is_anonymous_submission: primaryBaseImage.is_anonymous_submission || null,
                contribution_credit_platform: primaryBaseImage.contribution_credit_platform || null,
                contribution_credit_handle: primaryBaseImage.contribution_credit_handle || null,
                face_directions: face.face_directions ?? null,
              }
            : {
                id: resolvedImageId,
                url: face.url,
                crag_id: primaryBaseImage.crag_id || baseImage?.crag_id || null,
                width: face.metadata?.width ?? baseImage?.width ?? null,
                height: face.metadata?.height ?? baseImage?.height ?? null,
                natural_width: face.metadata?.width ?? baseImage?.natural_width ?? null,
                natural_height: face.metadata?.height ?? baseImage?.natural_height ?? null,
                created_by: primaryBaseImage.created_by || baseImage?.created_by || null,
                is_anonymous_submission: primaryBaseImage.is_anonymous_submission || baseImage?.is_anonymous_submission || null,
                contribution_credit_platform: primaryBaseImage.contribution_credit_platform || baseImage?.contribution_credit_platform || null,
                contribution_credit_handle: primaryBaseImage.contribution_credit_handle || baseImage?.contribution_credit_handle || null,
                face_directions: face.face_directions ?? null,
              }

          nextCache[resolvedImageId] = {
            image: nextImage,
            routeLines: faceRoutes.length > 0 ? faceRoutes : (previousEntry?.routeLines || []),
          }
        }

        faceRouteCacheRef.current = nextCache
        setFaceGallery(faces)
        setTotalFaces(typeof climbPackData.summary?.total_faces === 'number' ? Math.max(1, climbPackData.summary.total_faces) : Math.max(1, faces.length || 1))
        setTotalRoutesCombined(typeof climbPackData.summary?.total_routes === 'number' ? climbPackData.summary.total_routes : mappedLines.length)
        setCragPath(climbPackData.crag_path)
        setPublicSubmitter(climbPackData.public_submitter)
      } catch (err) {
        console.error('Error applying climb pack:', err)
        if (!cancelled) {
          setError('Failed to load climb')
        }
      } finally {
        if (!cancelled) {
          setIsApplyingClimbPack(false)
          setIsFacesLoading(false)
        }
      }
    }

    void applyClimbPack()
    return () => {
      cancelled = true
    }
  }, [climbId, climbPackData, clearSelection, resetZoomPan])

  useEffect(() => {
    if (!climbPackError) return
    console.error('Error loading climb pack:', climbPackError)
    setError('Failed to load climb')
  }, [climbPackError])

  useEffect(() => {
    const canonicalPath = climbPackData?.offline_pack?.canonicalPath
    if (!canonicalPath || canonicalPath === `/climb/${climbId}`) return
    if (selectedRouteParam || routeParamOverride || hasNonRouteSearchParams) return

    if (enableCanonicalRedirect && pathname !== canonicalPath) {
      router.replace(canonicalPath, { scroll: false })
    }
  }, [climbId, climbPackData?.offline_pack?.canonicalPath, enableCanonicalRedirect, hasNonRouteSearchParams, pathname, routeParamOverride, router, selectedRouteParam])

  const refreshOfflineStatus = useCallback(async () => {
    if (typeof window === 'undefined' || !climbId) return

    try {
      const status = await getOfflinePackStatus(climbId)
      setSavedOfflinePackVersion(status.pack?.version || null)
      setOfflineUsageBytes(status.usageBytes)
      setOfflineBudgetBytes(status.budgetBytes)
    } catch (statusError) {
      console.error('Failed to read offline pack status:', statusError)
    }
  }, [climbId])

  useEffect(() => {
    void refreshOfflineStatus()
  }, [refreshOfflineStatus])

  useEffect(() => {
    if (!emblaApi) return

    const rafId = window.requestAnimationFrame(() => {
      updateEmblaControls(true)
    })

    const handleSelect = () => {
      resetZoomPan()
      setIsFaceTransitioning(true)
      setCanvasFadeOut(true)
      setActiveCanvasImageId(null)
      setRouteLinesImageId(null)
      setRouteLines([])
      clearSelection()
      updateEmblaControls(false)
    }

    const handleSettle = () => {
      setIsFaceTransitioning(false)
      updateEmblaControls(true)
    }

    const handleReInit = () => {
      setIsFaceTransitioning(false)
      updateEmblaControls(true)
    }

    emblaApi.on('select', handleSelect)
    emblaApi.on('reInit', handleReInit)
    emblaApi.on('settle', handleSettle)
    return () => {
      window.cancelAnimationFrame(rafId)
      emblaApi.off('select', handleSelect)
      emblaApi.off('reInit', handleReInit)
      emblaApi.off('settle', handleSettle)
    }
  }, [emblaApi, updateEmblaControls, clearSelection, resetZoomPan])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.reInit()
    const rafId = window.requestAnimationFrame(() => {
      updateEmblaControls(true)
    })
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [emblaApi, emblaDragEnabled, updateEmblaControls])

  useEffect(() => {
    if (prevActiveFaceIndexRef.current === activeFaceIndex) {
      return
    }
    prevActiveFaceIndexRef.current = activeFaceIndex

    const activeFace = visibleFaces[activeFaceIndex]
    if (!activeFace) return

    const targetImageId = activeFace.image_id ?? activeFace.linked_image_id ?? primaryImageId
    if (!targetImageId) {
      setImage((prev) => prev ? { ...prev, url: activeFace.url } : prev)
      setActiveCanvasImageId(null)
      setRouteLinesImageId(null)
      setRouteLines([])
      setTransitionBuffer(null)
      setCanvasFadeOut(false)
      clearSelection()
      return
    }

    const cached = faceRouteCacheRef.current[targetImageId]
    if (cached) {
      setTransitionBuffer({
        faceId: activeFace.id,
        targetImageId,
        targetImage: cached.image,
        targetRoutes: cached.routeLines,
        hasRoutes: activeFace.has_routes,
        isLoading: true,
      })
      return
    }

    setTransitionBuffer({
      faceId: activeFace.id,
      targetImageId,
      targetImage: null,
      targetRoutes: null,
      hasRoutes: activeFace.has_routes,
      isLoading: true,
    })
  }, [activeFaceIndex, visibleFaces, primaryImageId, clearSelection])

  useEffect(() => {
    if (!transitionBuffer) return
    if (transitionBuffer.targetImage && transitionBuffer.targetRoutes) return

    const cached = faceRouteCacheRef.current[transitionBuffer.targetImageId]
    if (!cached) return

    setTransitionBuffer((prev) => {
      if (!prev || prev.targetImageId !== transitionBuffer.targetImageId) return prev
      return {
        ...prev,
        targetImage: cached.image,
        targetRoutes: cached.routeLines,
      }
    })
  }, [transitionBuffer, isFacesLoading, faceGallery])

  useLayoutEffect(() => {
    if (!transitionBuffer) return
    if (!transitionBuffer.targetImage || !transitionBuffer.targetRoutes) return
    if (!loadedFaceIdsRef.current.has(transitionBuffer.faceId)) return

    if (transitionBuffer.hasRoutes && transitionBuffer.targetRoutes.length === 0) {
      console.log('[FaceRoutes] Atomic commit has zero routes despite has_routes=true', {
        faceId: transitionBuffer.faceId,
        targetImageId: transitionBuffer.targetImageId,
      })
    }

    setImage(transitionBuffer.targetImage)
    setRouteLines(transitionBuffer.targetRoutes)
    setRouteLinesImageId(transitionBuffer.targetImageId)
    setActiveCanvasImageId(transitionBuffer.targetImageId)
    setCanvasFadeOut(false)
    setTransitionBuffer(null)
    setIsFaceTransitioning(false)
    resetZoomPan()
    clearSelection()
  }, [loadedFaceVersion, transitionBuffer, clearSelection, resetZoomPan])

  useEffect(() => {
    if (zoom > MIN_VIEWER_ZOOM) {
      setPan((prev) => clampPanForZoom(prev, zoom))
      return
    }
    setPan({ x: 0, y: 0 })
  }, [zoom, clampPanForZoom])

  useEffect(() => {
    if (visibleFaces.length === 0) {
      if (activeFaceIndex !== 0) setActiveFaceIndex(0)
      if (settledFaceIndex !== 0) setSettledFaceIndex(0)
      return
    }

    const maxIndex = visibleFaces.length - 1
    if (activeFaceIndex > maxIndex) {
      setActiveFaceIndex(maxIndex)
    }
    if (settledFaceIndex > maxIndex) {
      setSettledFaceIndex(maxIndex)
    }
  }, [visibleFaces.length, activeFaceIndex, settledFaceIndex])

  useEffect(() => {
    const current = visibleFaces[activeFaceIndex]
    const next = visibleFaces[activeFaceIndex + 1]
    const prev = visibleFaces[activeFaceIndex - 1]
    prefetchFaceImage(current)
    prefetchFaceImage(next)
    prefetchFaceImage(prev)
  }, [activeFaceIndex, visibleFaces, prefetchFaceImage])

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
    if (hasUserInteractedWithSelection) return

    if (effectiveRouteParam) {
      const exists = routeLines.some((route) => route.id === effectiveRouteParam)
      if (exists && selectedIds[0] !== effectiveRouteParam) {
        selectRoute(effectiveRouteParam)
        return
      }
    }

    if (selectedIds.length > 0) return

    const preselected = routeLines.find((route) => route.climb.id === climbId)
    if (preselected) {
      selectRoute(preselected.id)
    }
  }, [routeLines, effectiveRouteParam, selectedIds, hasUserInteractedWithSelection, selectRoute, climbId])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const liveRouteLines = routeLinesRef.current
    const liveSelectedIds = selectedIdsRef.current
    const liveUserLogs = userLogsRef.current

    if (!canvas) return
    if (canvas.width <= 0 || canvas.height <= 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const firstRouteImageId = liveRouteLines[0]?.imageId || null
    if (!firstRouteImageId || activeCanvasImageId !== firstRouteImageId || routeLinesImageId !== firstRouteImageId) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    if (liveRouteLines.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const imageElement = imageRef.current
    if (!imageElement || !imageElement.complete || imageElement.naturalWidth === 0 || imageElement.naturalHeight === 0) return

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
  }, [activeCanvasImageId, routeLinesImageId])

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

      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      if (containerWidth <= 0 || containerHeight <= 0) return

      const imageAspect = imageElement.naturalWidth / imageElement.naturalHeight
      const containerAspect = containerWidth / containerHeight

      let displayWidth = 0
      let displayHeight = 0
      let offsetX = 0
      let offsetY = 0

      if (imageAspect > containerAspect) {
        displayWidth = containerWidth
        displayHeight = containerWidth / imageAspect
        offsetY = (containerHeight - displayHeight) / 2
      } else {
        displayHeight = containerHeight
        displayWidth = containerHeight * imageAspect
        offsetX = (containerWidth - displayWidth) / 2
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
      if (suppressCanvasClickRef.current) {
        suppressCanvasClickRef.current = false
        return
      }

      const canvas = canvasRef.current
      if (!canvas || routeLines.length === 0) return

      setHasUserInteractedWithSelection(true)

      const canvasRect = canvas.getBoundingClientRect()
      const canvasX = e.clientX - canvasRect.left
      const canvasY = e.clientY - canvasRect.top
      if (canvasRect.width <= 0 || canvasRect.height <= 0) return

      const normalizedPoint = {
        x: canvasX / canvasRect.width,
        y: canvasY / canvasRect.height,
      }

      const threshold = 20 / Math.max(1, Math.min(canvasRect.width, canvasRect.height))
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

      selectRoute(clickedRoute.id)
      updateRouteParam(clickedRoute.id)
      scrollRouteCardIntoView(clickedRoute.id)
    },
    [routeLines, clearSelection, updateRouteParam, selectRoute, scrollRouteCardIntoView]
  )

  const handleViewerTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        const [touchA, touchB] = [e.touches[0], e.touches[1]]
        const dx = touchA.clientX - touchB.clientX
        const dy = touchA.clientY - touchB.clientY
        const distance = Math.hypot(dx, dy)
        touchStateRef.current = {
          mode: 'pinch',
          startDistance: distance,
          startZoom: zoom,
          startPan: pan,
          startTouch: null,
        }
        return
      }

      if (e.touches.length === 1 && zoom > MIN_VIEWER_ZOOM) {
        const touch = e.touches[0]
        touchStateRef.current = {
          mode: 'pan',
          startDistance: 0,
          startZoom: zoom,
          startPan: pan,
          startTouch: {
            x: touch.clientX,
            y: touch.clientY,
          },
        }
      }
    },
    [zoom, pan]
  )

  const handleViewerTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touchState = touchStateRef.current

      if (touchState.mode === 'pinch' && e.touches.length === 2) {
        const [touchA, touchB] = [e.touches[0], e.touches[1]]
        const dx = touchA.clientX - touchB.clientX
        const dy = touchA.clientY - touchB.clientY
        const distance = Math.hypot(dx, dy)
        if (touchState.startDistance <= 0) return

        const nextZoom = Math.min(
          MAX_VIEWER_ZOOM,
          Math.max(MIN_VIEWER_ZOOM, touchState.startZoom * (distance / touchState.startDistance))
        )
        setZoom(nextZoom)
        setPan((prev) => clampPanForZoom(prev, nextZoom))
        suppressCanvasClickRef.current = true
        e.preventDefault()
        return
      }

      if (touchState.mode === 'pan' && e.touches.length === 1 && zoom > MIN_VIEWER_ZOOM && touchState.startTouch) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - touchState.startTouch.x
        const deltaY = touch.clientY - touchState.startTouch.y
        setPan(
          clampPanForZoom(
            {
              x: touchState.startPan.x + deltaX,
              y: touchState.startPan.y + deltaY,
            },
            zoom
          )
        )
        suppressCanvasClickRef.current = true
        e.preventDefault()
      }
    },
    [zoom, clampPanForZoom]
  )

  const handleViewerTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 0) {
        touchStateRef.current = {
          mode: 'none',
          startDistance: 0,
          startZoom: zoom,
          startPan: pan,
          startTouch: null,
        }
        return
      }

      if (e.touches.length === 1 && zoom > MIN_VIEWER_ZOOM) {
        const touch = e.touches[0]
        touchStateRef.current = {
          mode: 'pan',
          startDistance: 0,
          startZoom: zoom,
          startPan: pan,
          startTouch: {
            x: touch.clientX,
            y: touch.clientY,
          },
        }
      }
    },
    [zoom, pan]
  )

  const viewerReadyState = !isFaceTransitioning && routeLines.length > 0 ? 'idle' : 'busy'

  const getAuthRedirectPath = useCallback(() => {
    return selectedRoute
      ? `${pathname}?route=${selectedRoute.id}`
      : pathname
  }, [pathname, selectedRoute])

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
    return runWhenIdle(() => setShowDeferredSections(true), 1200)
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
    const run = () => {
      if (cancelled) return
      void loadStarRatingSummary(selectedClimb.id)
    }

    const cancelIdle = runWhenIdle(run, 900)

    return () => {
      cancelled = true
      cancelIdle()
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

  const isWaitingForClimbHydration = !!climbPackData && !image && !error && !climbPackError

  if (isClimbPackLoading || isApplyingClimbPack || isWaitingForClimbHydration) {
    return <ClimbPageSkeleton />
  }

  if (error || climbPackError || !image) {
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
  const offlinePack = climbPackData?.offline_pack || null
  const isOfflineSaved = !!savedOfflinePackVersion
  const offlineSaveWouldExceedBudget = offlinePack
    ? (offlineUsageBytes - (savedOfflinePackVersion ? offlinePack.estimatedBytes : 0) + offlinePack.estimatedBytes) > offlineBudgetBytes
    : false

  const handleConfirmOfflineSave = async () => {
    if (!offlinePack) return

    setOfflineActionLoading(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false)
      }

      const status = await getOfflinePackStatus(climbId)
      const projectedUsage = status.usageBytes - (status.pack?.estimatedBytes || 0) + offlinePack.estimatedBytes
      if (projectedUsage > status.budgetBytes) {
        setToast('Not enough offline storage budget. Remove another pack first.')
        setTimeout(() => setToast(null), 2500)
        return
      }

      if (!climbPackData) {
        throw new Error('Climb data unavailable for offline save')
      }

      await saveClimbOfflinePack(climbPackData)
      await refreshOfflineStatus()
      setOfflineDialogOpen(false)
      setToast('Climb saved for offline viewing')
      setTimeout(() => setToast(null), 2500)
    } catch (saveError) {
      console.error('Offline save failed:', saveError)
      setToast('Failed to save offline pack')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setOfflineActionLoading(false)
    }
  }

  const handleRemoveOfflinePack = async () => {
    setOfflineActionLoading(true)
    try {
      await deleteClimbOfflinePack(climbId)
      await refreshOfflineStatus()
      setOfflineDialogOpen(false)
      setToast('Offline pack removed')
      setTimeout(() => setToast(null), 2500)
    } catch (removeError) {
      console.error('Offline pack removal failed:', removeError)
      setToast('Failed to remove offline pack')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setOfflineActionLoading(false)
    }
  }

  const routeSchema = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: displayClimb?.name || 'Climbing route',
    description: displayClimb?.grade
      ? `${displayClimb.grade}${displayClimbTypeLabel ? ` ${displayClimbTypeLabel.toLowerCase()}` : ''} route`
      : 'Climbing route',
    url: `${SITE_URL}${pathname}`,
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

      <ClimbFaceViewer
        visibleFaces={visibleFaces}
        activeFaceIndex={activeFaceIndex}
        totalFaces={totalFaces}
        canScrollPrev={canScrollPrev}
        canScrollNext={canScrollNext}
        zoom={zoom}
        minViewerZoom={MIN_VIEWER_ZOOM}
        pan={pan}
        canvasFadeOut={canvasFadeOut}
        transitionBufferLoading={!!transitionBuffer?.isLoading}
        displayClimbName={displayClimb?.name || 'Climbing routes'}
        viewerReadyState={viewerReadyState}
        displayRouteTapPoint={displayRouteTapPoint}
        emblaRef={emblaRef}
        viewerTransformRef={viewerTransformRef}
        imageRef={imageRef}
        canvasRef={canvasRef}
        onTouchStart={handleViewerTouchStart}
        onTouchMove={handleViewerTouchMove}
        onTouchEnd={handleViewerTouchEnd}
        onCanvasClick={handleCanvasClick}
        onFaceLoad={markFaceLoaded}
        onScrollPrev={() => emblaApi?.scrollPrev()}
        onScrollNext={() => emblaApi?.scrollNext()}
        onScrollTo={(index) => emblaApi?.scrollTo(index)}
        onPrefetchFace={(face) => {
          prefetchFaceImage(face ? visibleFaces.find((item) => item.id === face.id) : undefined)
        }}
        onResetZoomPan={resetZoomPan}
      />

      <ClimbRouteRail
        routeLines={routeLines}
        selectedIds={selectedIds}
        gradeSystem={gradeSystem}
        routeCardRefs={routeCardRefs}
        onSelectRoute={(routeId) => {
          setHasUserInteractedWithSelection(true)
          selectRoute(routeId)
          updateRouteParam(routeId)
          scrollRouteCardIntoView(routeId)
        }}
      />

      <ClimbInfoPanel
        selectedClimb={selectedClimb}
        selectedRouteExists={!!selectedRoute}
        totalRoutesCombined={totalRoutesCombined}
        totalFaces={totalFaces}
        isFacesLoading={isFacesLoading}
        cragPath={cragPath}
        isOfflineSaved={isOfflineSaved}
        offlinePackAvailable={!!offlinePack}
        publicSubmitter={publicSubmitter ? { id: publicSubmitter.id, displayName: publicSubmitter.displayName } : null}
        formattedContributionHandle={formattedContributionHandle}
        contributionCreditUrl={contributionCreditUrl}
        selectedClimbLogged={selectedClimbLogged}
        selectedClimbLog={selectedClimbLog}
        selectedClimbHasSavedFeedback={selectedClimbHasSavedFeedback}
        selectedClimbFeedbackCollapsed={selectedClimbFeedbackCollapsed}
        selectedClimbRatingSummary={selectedClimbRatingSummary}
        selectedClimbAverageRating={selectedClimbAverageRating}
        selectedClimbRoundedStars={selectedClimbRoundedStars}
        pendingGradeOpinion={pendingGradeOpinion}
        pendingStarRating={pendingStarRating}
        savingFeedback={savingFeedback}
        logging={logging}
        userPresent={!!user}
        gradeSystem={gradeSystem}
        gradeOpinionLabels={GRADE_OPINION_LABELS}
        formatRouteTypeLabel={formatRouteTypeLabel}
        onOpenOffline={() => setOfflineDialogOpen(true)}
        onOpenFlag={handleOpenFlagModal}
        onShare={typeof navigator.share === 'function' ? handleNativeShare : () => setShareModalOpen(true)}
        onGoToAuth={() => {
          router.push(`/auth?redirect_to=${encodeURIComponent(getAuthRedirectPath())}`)
        }}
        onLog={handleLog}
        onSetFeedbackCollapsed={(collapsed) => {
          if (!selectedClimb) return
          setFeedbackCollapsedByClimbId((prev) => ({ ...prev, [selectedClimb.id]: collapsed }))
        }}
        onSetPendingGradeOpinion={setPendingGradeOpinion}
        onSetPendingStarRating={setPendingStarRating}
        onSaveFeedback={handleSaveFeedback}
        onGoToLogbook={() => router.push('/logbook')}
        deferredSections={
          <>
            {showDeferredSections && image.id && !image.id.startsWith('legacy-') ? <VideoBetaSection climbId={activeClimbId} /> : null}
            {showDeferredSections && image.id && !image.id.startsWith('legacy-') ? <CommentThread targetType="image" targetId={image.id} userId={user?.id || null} className="mt-6" /> : null}
          </>
        }
      />

      {shareModalOpen ? (
        <ClimbShareDialog
          open={shareModalOpen}
          climbName={displayClimb?.name || 'this climb'}
          onOpenChange={setShareModalOpen}
          onShareTwitter={handleShareTwitter}
          onShareFacebook={handleShareFacebook}
          onShareWhatsApp={handleShareWhatsApp}
          onCopyLink={handleCopyLink}
        />
      ) : null}

      {offlineDialogOpen ? (
        <ClimbOfflineDialog
          open={offlineDialogOpen}
          isOfflineSaved={isOfflineSaved}
          offlineActionLoading={offlineActionLoading}
          offlineSaveWouldExceedBudget={offlineSaveWouldExceedBudget}
          climbName={displayClimb?.name || climbPackData?.climb?.name || 'This climb'}
          offlinePack={offlinePack}
          offlineUsageBytes={offlineUsageBytes}
          offlineBudgetBytes={offlineBudgetBytes}
          formatBytes={formatBytes}
          onOpenChange={setOfflineDialogOpen}
          onConfirmSave={handleConfirmOfflineSave}
          onRemove={handleRemoveOfflinePack}
        />
      ) : null}

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
