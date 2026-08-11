'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { useImageNavigation } from '@/features/image-first/hooks/use-image-navigation'
import { useSelectedClimbState } from '@/features/image-first/hooks/use-selected-climb-state'
import { ImageFirstCanvasCarousel, ImageFirstDeferredSections, ImageFirstFooterRail } from '@/features/image-first/components/image-first-sections'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/features/image-first/types'
import { normalizePoints } from '@/lib/canvasMath'
import { createClient } from '@/lib/supabase'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'
import type { RouteLine, RoutePoint } from '@/types/domain'
import { ClimbInfoPanel } from '@/features/climb/public-client'
import { ClimbShareDialog } from '@/features/climb/public-client'
import FlagClimbModal from '@/components/FlagClimbModal'
import { saveClimbFeedbackAction } from '@/features/climb/public-actions'
import { getGradeSystemForClimbType, useGradePreferences } from '@/lib/grades/preferences'
import { logRoutesAction } from '@/features/logbook/public-actions'
import { ownLogbookLogsQueryKeyPrefix, ownLogbookSubmissionsQueryKey, ownLogbookSummaryQueryKey } from '@/features/logbook/public-client'
import { saveClimbAction } from '@/features/saved/public-actions'
import { unsaveClimbAction } from '@/features/saved/public-actions'
import type { GradeOpinion } from '@/lib/grade-feedback'
import { parseRoutePoints } from '@/features/route-editor/public'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import LightweightCragMap from '@/components/LightweightCragMap'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getPendingMutations, queueMutation } from '@/features/offline/public'
import { replayPendingMutations } from '@/features/offline/public'

type ExportMode = 'image' | 'selected-route' | 'all-routes'

interface SelectedPinImageRailProps {
  pin: LightweightCragMapPin | null
  activeImageId: string | null
  imageMap: Record<string, { src: string; width: number; height: number }>
  onSelectImage: (imageId: string) => void
}

function SelectedPinImageRail({ pin, activeImageId, imageMap, onSelectImage }: SelectedPinImageRailProps) {
  const imageIds = pin?.activeImageIds || []
  const availableImageIds = imageIds.filter((imageId) => Boolean(imageMap[imageId]))

  if (!pin || availableImageIds.length === 0) return null

  return (
    <section className="mt-3 rounded-[28px] border border-white/10 bg-zinc-950/90 p-3 text-white shadow-2xl shadow-black/25" aria-label="Images at selected pin">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Images at selected pin</h2>
          <p className="mt-0.5 text-xs text-zinc-400">Select an image to switch the route viewer.</p>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200">
          {availableImageIds.length} image{availableImageIds.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {availableImageIds.map((imageId, index) => {
          const imageMeta = imageMap[imageId]
          const active = imageId === activeImageId
          return (
            <button
              key={imageId}
              type="button"
              onClick={() => onSelectImage(imageId)}
              aria-pressed={active}
              className={`group min-w-[7.5rem] overflow-hidden rounded-2xl border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${active ? 'border-amber-300 bg-amber-300/10 ring-2 ring-amber-300/35' : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'}`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
                <Image
                  src={imageMeta.src}
                  alt={`Selected pin image ${index + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <span className="text-xs font-medium text-zinc-100">Image {index + 1}</span>
                {active ? <span className="text-[11px] font-semibold text-amber-200">Active</span> : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function ImageFirstClient({ payload }: { payload: ImageFirstPayload }) {
  const queryClient = useQueryClient()
  const {
    heroImage,
    initialRoutes,
    navigationContext: initialNavigationContext,
    countryCode,
    cragId,
    cragSlug,
  } = payload
  const [navigationContext, setNavigationContext] = useState(initialNavigationContext)
  const navigationLoadingRef = useRef(false)
  const { linkedImageIdByDisplayId } = navigationContext
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const gradePreferences = useGradePreferences()
  const { toasts, addToast, removeToast } = useToast()
  const [hasHydratedAuth, setHasHydratedAuth] = useState(false)
  const [userPresent, setUserPresent] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [pendingLogClimbIds, setPendingLogClimbIds] = useState<Set<string>>(new Set())
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [logging, setLogging] = useState(false)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [savingWantToTry, setSavingWantToTry] = useState(false)
  const [downloadingPost, setDownloadingPost] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, ImageFirstRouteLine[]>>(() => {
    const primaryId = linkedImageIdByDisplayId[heroImage.displayImageId] || heroImage.displayImageId
    return { [primaryId]: initialRoutes }
  })
  const fetchedRouteImageIdsRef = useRef(new Set<string>(Object.keys({ [linkedImageIdByDisplayId[heroImage.displayImageId] || heroImage.displayImageId]: true })))
  const idlePreloadStartedRef = useRef(false)
  const activeDisplayImageId = useMemo(() => {
    const pathImageId = pathname?.split('/').pop()
    return navigationContext.orderedImageIds.find((imageId) => imageId === pathImageId || linkedImageIdByDisplayId[imageId] === pathImageId)
      || heroImage.displayImageId
  }, [heroImage.displayImageId, linkedImageIdByDisplayId, navigationContext.orderedImageIds, pathname])
  const handleActiveImageIndexChange = useCallback((index: number) => {
    const displayImageId = navigationContext.orderedImageIds[index]
    if (!displayImageId) return

    const imageId = linkedImageIdByDisplayId[displayImageId] || displayImageId
    const params = new URLSearchParams(searchParams.toString())
    params.delete('climb')
    params.delete('route')
    const query = params.toString()
    router.push(`/${countryCode}/${cragSlug}/i/${imageId}${query ? `?${query}` : ''}`, { scroll: false })
  }, [countryCode, cragSlug, linkedImageIdByDisplayId, navigationContext.orderedImageIds, router, searchParams])

  const {
    activeImageIndex,
    activeImageId,
    emblaRef,
    setActiveImageIndex,
    isFirst,
    isLast,
  } = useImageNavigation({
    orderedImageIds: navigationContext.orderedImageIds,
    startIndex: navigationContext.startIndex,
    selectedImageId: activeDisplayImageId,
    onActiveImageIndexChange: handleActiveImageIndexChange,
    linkedImageIdByDisplayId,
    stacks: navigationContext.stacks,
    sectorMarkers: navigationContext.sectorMarkers,
  })

  useEffect(() => {
    if (activeImageIndex < navigationContext.orderedImageIds.length - 4 || navigationLoadingRef.current) return
    navigationLoadingRef.current = true

    fetch(`/api/image-first/images?cragId=${encodeURIComponent(navigationContext.cragId)}&offset=${navigationContext.loadedCount}`)
      .then((response) => response.ok ? response.json() as Promise<{
        images?: Array<{ id: string; url: string; src: string; width: number | null; height: number | null; created_at: string | null; latitude: number | null; longitude: number | null }>
        nextOffset?: number
        hasMore?: boolean
      }> : Promise.reject(new Error('navigation request failed')))
      .then((result) => {
        const rows = result.images || []
        if (rows.length === 0) return
        setNavigationContext((current) => {
          const existing = new Set(current.orderedImageIds)
          const nextRows = rows.filter((row) => !existing.has(row.id))
          const nextMap = { ...current.imageMap }
          for (const row of nextRows) {
            nextMap[row.id] = {
              src: row.src,
              width: row.width ?? 1600,
              height: row.height ?? 1200,
            }
          }
          const nextIds = [...current.orderedImageIds, ...nextRows.map((row) => row.id)]
          return {
            ...current,
            loadedCount: result.nextOffset ?? current.loadedCount + rows.length,
            orderedImageIds: nextIds,
            imageMap: nextMap,
            stacks: [...current.stacks, ...nextRows.map((row) => ({ stackId: `stack:${row.id}`, imageIds: [row.id] }))],
          }
        })
      })
      .catch(() => {})
      .finally(() => {
        navigationLoadingRef.current = false
      })
  }, [activeImageIndex, navigationContext])

  useEffect(() => {
    const supabase = createClient()

    const syncAdminStatus = async (hasUser: boolean) => {
      if (!hasUser) {
        setIsAdmin(false)
        return
      }

      try {
        const { data: isAdmin } = await isCurrentUserAdmin(supabase)
        setIsAdmin(isAdmin === true)
      } catch {
        setIsAdmin(false)
      }
    }

    const syncUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        startTransition(() => {
          setUserPresent(true)
          setUserId(session.user.id)
          setHasHydratedAuth(true)
        })
        void syncAdminStatus(true)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      startTransition(() => {
        setUserPresent(!!user)
        setUserId(user?.id ?? null)
        setHasHydratedAuth(true)
      })
      void syncAdminStatus(!!user)
    }

    void syncUser()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      startTransition(() => {
        setUserPresent(!!session?.user)
        setUserId(session?.user?.id ?? null)
        setHasHydratedAuth(true)
      })
      void syncAdminStatus(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(window.navigator.onLine !== false)
    updateOnlineStatus()

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setPendingLogClimbIds(new Set())
      return
    }

    const refreshPendingState = async () => {
      const records = await getPendingMutations(userId)
      const climbIds = new Set<string>()
      for (const record of records) {
        if (record.operationType !== 'LOG_CLIMB' || !record.payload || typeof record.payload !== 'object') continue
        const payload = record.payload as { climbIds?: unknown }
        if (Array.isArray(payload.climbIds)) {
          for (const climbId of payload.climbIds) if (typeof climbId === 'string') climbIds.add(climbId)
        }
      }
      setPendingLogClimbIds(climbIds)
    }

    const replay = async () => {
      if (window.navigator.onLine === false) return
      await replayPendingMutations(userId)
      await refreshPendingState()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ownLogbookSummaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ownLogbookLogsQueryKeyPrefix }),
        queryClient.invalidateQueries({ queryKey: ownLogbookSubmissionsQueryKey }),
      ])
    }

    void refreshPendingState()
    void replay()
    window.addEventListener('online', replay)
    return () => window.removeEventListener('online', replay)
  }, [queryClient, userId])

  const fetchRoutesForImageIds = useCallback(async (imageIds: string[]) => {
    const targets = imageIds.filter((imageId) => {
      if (!imageId) return false
      if (fetchedRouteImageIdsRef.current.has(imageId)) return false
      fetchedRouteImageIdsRef.current.add(imageId)
      return true
    })

    if (targets.length === 0) return

    const supabase = createClient()
    const { data, error } = await supabase
      .from('route_lines')
      .select('id, image_id, climb_id, color, points, image_width, image_height, sequence_order, created_at, climbs (id, name, slug, grade, description, route_type, shared_climb_id)')
      .in('image_id', targets)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error || !data) {
      for (const imageId of targets) {
        fetchedRouteImageIdsRef.current.delete(imageId)
      }
      return
    }

    const grouped: Record<string, ImageFirstRouteLine[]> = {}
    for (const imageId of targets) {
      grouped[imageId] = []
    }

    for (const row of data as Array<{
      id: string
      image_id: string
      climb_id: string
      color: string | null
      points: RoutePoint[] | string | null
      image_width: number | null
      image_height: number | null
      sequence_order: number | null
      created_at: string | null
      climbs: {
        id: string
        name: string | null
        slug: string | null
        grade: string | null
        description: string | null
        route_type: string | null
        shared_climb_id: string | null
      } | Array<{
        id: string
        name: string | null
        slug: string | null
        grade: string | null
        description: string | null
        route_type: string | null
        shared_climb_id: string | null
      }> | null
    }>) {
      const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
      if (!row.image_id || !climb) continue

      grouped[row.image_id]?.push({
        routeId: row.id,
        climbId: row.climb_id,
        effectiveClimbId: climb.shared_climb_id || row.climb_id,
        imageId: row.image_id,
        climbSlug: climb.slug || null,
        climbName: climb.name || 'Unnamed route',
        climbGrade: climb.grade || null,
        climbDescription: climb.description || null,
        climbRouteType: climb.route_type || null,
        pathData: row.points,
        color: row.color || '#ef4444',
        isPrimary: false,
      })
    }

    setRoutesByImageId((prev) => ({ ...prev, ...grouped }))
  }, [])

  const activePrimaryImageId = useMemo(() => {
    const displayImageId = activeImageId || heroImage.displayImageId
    return linkedImageIdByDisplayId[displayImageId] || displayImageId
  }, [activeImageId, heroImage.displayImageId, linkedImageIdByDisplayId])

  const activeRoutes = useMemo(() => routesByImageId[activePrimaryImageId] || [], [activePrimaryImageId, routesByImageId])

  const resolvedActiveRouteId = useMemo(() => {
    if (activeRoutes.length === 0) return null

    const routeQuery = searchParams.get('route')
    if (routeQuery) {
      const queryMatch = activeRoutes.find((route) => route.climbSlug === routeQuery || route.routeId === routeQuery)
      if (queryMatch) return queryMatch.routeId
    }

    const climbQueryId = searchParams.get('climb')
    if (climbQueryId) {
      const climbMatch = activeRoutes.find((route) => route.climbId === climbQueryId)
      if (climbMatch) return climbMatch.routeId
    }

    return activeRoutes[0]?.routeId || null
  }, [activeRoutes, searchParams])

  const activeRouteMeta = useMemo(
    () => activeRoutes.find((route) => route.routeId === resolvedActiveRouteId) || null,
    [activeRoutes, resolvedActiveRouteId]
  )

  const activeRouteId = resolvedActiveRouteId

  const activeClimbId = activeRouteMeta?.climbId || null
  const activeEffectiveClimbId = activeRouteMeta?.effectiveClimbId || null
  const {
    selectedClimbLogged,
    setSelectedClimbLogged,
    selectedClimbLog,
    setSelectedClimbLog,
    selectedClimbRatingSummary,
    selectedClimbHasSavedFeedback,
    setSelectedClimbHasSavedFeedback,
    selectedClimbFeedbackCollapsed,
    setSelectedClimbFeedbackCollapsed,
    pendingGradeOpinion,
    setPendingGradeOpinion,
    pendingStarRating,
    setPendingStarRating,
    pendingNotes,
    setPendingNotes,
    loadingSelectedClimbState,
    isWantToTrySaved,
    setIsWantToTrySaved,
    communityNotesCount,
    communityNotes,
    communityNotesExpanded,
    setCommunityNotesExpanded,
  } = useSelectedClimbState({
    activeClimbId,
    activeEffectiveClimbId,
    pendingLogClimbIds,
    userPresent,
  })
  const activeClimbIdRef = useRef(activeClimbId)

  useEffect(() => {
    activeClimbIdRef.current = activeClimbId
  }, [activeClimbId])

  useEffect(() => {
    const targets = [
      navigationContext.orderedImageIds[activeImageIndex - 1],
      navigationContext.orderedImageIds[activeImageIndex],
      navigationContext.orderedImageIds[activeImageIndex + 1],
    ]
      .filter((imageId): imageId is string => Boolean(imageId))
      .map((displayImageId) => linkedImageIdByDisplayId[displayImageId] || displayImageId)

    void fetchRoutesForImageIds(Array.from(new Set(targets)))
  }, [activeImageIndex, fetchRoutesForImageIds, linkedImageIdByDisplayId, navigationContext.orderedImageIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (idlePreloadStartedRef.current) return
    idlePreloadStartedRef.current = true

    const remainingImageIds = navigationContext.orderedImageIds
      .map((displayImageId) => linkedImageIdByDisplayId[displayImageId] || displayImageId)
      .filter((imageId) => !fetchedRouteImageIdsRef.current.has(imageId))

    if (remainingImageIds.length === 0) return

    const preloadInBatches = async () => {
      const batchSize = 8

      for (let index = 0; index < remainingImageIds.length; index += batchSize) {
        const batch = remainingImageIds.slice(index, index + batchSize)
        try {
          await fetchRoutesForImageIds(batch)
        } catch {
          return
        }
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleCallbackId: number | null = null

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(() => {
        void preloadInBatches()
      }, { timeout: 2000 })
    } else {
      timeoutId = setTimeout(() => {
        void preloadInBatches()
      }, 1500)
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleCallbackId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallbackId)
      }
    }
  }, [fetchRoutesForImageIds, linkedImageIdByDisplayId, navigationContext.orderedImageIds])

  const allRoutesFlat = useMemo(
    () => Object.values(routesByImageId).flat(),
    [routesByImageId]
  )

  const selectedClimb = useMemo(() => {
    if (!activeRouteMeta) return null
    return {
      id: activeRouteMeta.climbId,
      name: activeRouteMeta.climbName,
      grade: activeRouteMeta.climbGrade || 'Unknown',
      route_type: activeRouteMeta.climbRouteType,
      description: activeRouteMeta.climbDescription,
    }
  }, [activeRouteMeta])

  const gradeSystem = useMemo(
    () => getGradeSystemForClimbType(selectedClimb?.route_type || undefined, gradePreferences),
    [gradePreferences, selectedClimb?.route_type]
  )

  const updateLocalClimbGrade = useCallback((climbId: string, grade: string) => {
    setRoutesByImageId((previous) => {
      let changed = false
      const next: Record<string, ImageFirstRouteLine[]> = {}

      for (const [imageId, routes] of Object.entries(previous)) {
        const updatedRoutes = routes.map((route) => {
          if (route.climbId !== climbId) return route
          changed = true
          return {
            ...route,
            climbGrade: grade,
          }
        })
        next[imageId] = updatedRoutes
      }

      return changed ? next : previous
    })
  }, [])

  const activeImageMeta = useMemo(
    () => activeImageId ? navigationContext.imageMap[activeImageId] || heroImage : heroImage,
    [activeImageId, navigationContext.imageMap, heroImage]
  )
  const activeCanvasImageUrl = activeImageMeta.src || heroImage.src

  const [allMapPins, setAllMapPins] = useState<LightweightCragMapPin[]>(() => {
    const initialPins = payload.mapPins.map((pin) => ({
      id: pin.imageId,
      latitude: pin.latitude,
      longitude: pin.longitude,
      label: String(pin.activeImageIds.length),
      activeImageIds: pin.activeImageIds,
      primaryImageId: pin.primaryImageId,
    }))

    const useFallback = initialPins.length === 0 && typeof heroImage.latitude === 'number' && typeof heroImage.longitude === 'number'
    if (useFallback) {
      return [{
        id: heroImage.displayImageId,
        latitude: heroImage.latitude as number,
        longitude: heroImage.longitude as number,
        label: '1',
        activeImageIds: [heroImage.displayImageId],
        primaryImageId: heroImage.displayImageId,
      }]
    }

    return initialPins
  })

  useEffect(() => {
    if (!cragId) return

    const controller = new AbortController()
    const signal = controller.signal

    fetch(
      `/api/image-first/pins?cragId=${cragId}&north=90&south=-90&east=180&west=-180`,
      { signal }
    )
      .then((res) => res.json())
      .then((data: { pins?: Array<{ imageId: string; latitude: number; longitude: number; activeImageIds: string[]; primaryImageId: string }> }) => {
        const pins = (data.pins || []).map((p) => ({
          id: p.imageId,
          latitude: p.latitude,
          longitude: p.longitude,
          label: String(p.activeImageIds.length),
          activeImageIds: p.activeImageIds,
          primaryImageId: p.primaryImageId,
        }))
        if (pins.length > 0 && signal.aborted === false) {
          setAllMapPins(pins)
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [cragId])

  const mapPins = allMapPins

  const selectedMapPin = useMemo(() => {
    if (!activeImageId) return mapPins[0] || null
    return mapPins.find((pin) => pin.activeImageIds?.includes(activeImageId) === true || pin.primaryImageId === activeImageId || pin.id === activeImageId)
      || mapPins[0]
      || null
  }, [activeImageId, mapPins])

  const mapInitialCenter = useMemo<[number, number] | null>(() => {
    const centerPin = selectedMapPin || mapPins[0]
    if (!centerPin) return null
    return [centerPin.latitude, centerPin.longitude]
  }, [mapPins, selectedMapPin])

  const handleSelectImage = useCallback((imageId: string) => {
    const nextIndex = navigationContext.orderedImageIds.indexOf(imageId)
    if (nextIndex >= 0) handleActiveImageIndexChange(nextIndex)
  }, [handleActiveImageIndexChange, navigationContext.orderedImageIds])

  const visibleRoutes = useMemo(() => {
    const filteredRoutes = activeRoutes.filter(route => route.imageId === activePrimaryImageId)

    return filteredRoutes.map((route) => {
      const rawPoints = parseRoutePoints(route.pathData)
      const normalized = normalizePoints(rawPoints, {
        width: activeImageMeta.width,
        height: activeImageMeta.height,
        naturalWidth: activeImageMeta.width,
        naturalHeight: activeImageMeta.height,
      })

      return {
        id: route.routeId,
        image_id: route.imageId,
        climb_id: route.climbId,
        points: normalized,
        color: route.color,
        sequence_order: 0,
        created_at: '',
        climb: {
          id: route.climbId,
          name: route.climbName,
          grade: route.climbGrade || 'Unknown',
          status: 'approved',
          route_type: route.climbRouteType,
          description: route.climbDescription,
        },
      } as RouteLine
    })
    .filter((route) => route.points.length >= 2)
  }, [activeImageMeta, activePrimaryImageId, activeRoutes])

  const handleGoToAuth = useCallback(() => {
    const currentPath = pathname || `/${countryCode}/${cragSlug}/i/${heroImage.displayImageId}`
    const query = searchParams.toString()
    const returnTo = query ? `${currentPath}?${query}` : currentPath
    router.push(`/auth?redirect_to=${encodeURIComponent(returnTo)}`)
  }, [countryCode, cragSlug, heroImage.displayImageId, pathname, router, searchParams])

  const handleEditRoute = useCallback(() => {
    if (!activePrimaryImageId || !resolvedActiveRouteId) return

    const editParams = new URLSearchParams()
    editParams.set('route', resolvedActiveRouteId)
    const editUrl = `/logbook/submissions/${activePrimaryImageId}/edit?${editParams.toString()}`

    if (!userPresent) {
      router.push(`/auth?redirect_to=${encodeURIComponent(editUrl)}`)
      return
    }

    router.push(editUrl)
  }, [activePrimaryImageId, resolvedActiveRouteId, router, userPresent])

  const handleAddRoutes = useCallback(() => {
    if (!activePrimaryImageId) return

    const editUrl = `/logbook/submissions/${activePrimaryImageId}/edit`

    if (!userPresent) {
      router.push(`/auth?redirect_to=${encodeURIComponent(editUrl)}`)
      return
    }

    router.push(editUrl)
  }, [activePrimaryImageId, router, userPresent])

  const handleRouteSelect = useCallback((routeId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    const route = activeRoutes.find((candidate) => candidate.routeId === routeId)
    if (route) params.set('route', route.climbSlug || route.routeId)
    else params.delete('route')
    params.delete('climb')
    const query = params.toString()
    router.push(`/${countryCode}/${cragSlug}/i/${activePrimaryImageId}${query ? `?${query}` : ''}`, { scroll: false })
  }, [activePrimaryImageId, activeRoutes, countryCode, cragSlug, router, searchParams])

  const handleLog = useCallback(async (style: 'flash' | 'top' | 'try', notes?: string) => {
    if (!activeClimbId || !userPresent) return false

    const targetClimbId = activeClimbId
    const climbedOn = new Date().toLocaleDateString('en-CA')
    const mutationId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const payload = { climbIds: [targetClimbId], style, notes: notes || undefined, climbedOn }
    setLogging(true)
    try {
      if (isOnline !== true) {
        if (!userId) return false
        await queueMutation({ mutationId, userId, operationType: 'LOG_CLIMB', payload, createdAt })
        setPendingLogClimbIds((current) => new Set(current).add(targetClimbId))
        setSelectedClimbLogged(true)
        addToast('Climb logged locally. Pending sync.', 'success')
        return true
      }

      const result = await logRoutesAction([targetClimbId], style, notes || undefined, climbedOn, mutationId, createdAt)
      if (!result.success) throw new Error(result.error)

      if (activeClimbIdRef.current !== targetClimbId) {
        addToast('Climb logged', 'success')
        return true
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ownLogbookSummaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ownLogbookLogsQueryKeyPrefix }),
        queryClient.invalidateQueries({ queryKey: ownLogbookSubmissionsQueryKey }),
      ])

      setSelectedClimbLogged(true)
      setSelectedClimbFeedbackCollapsed(false)
      setPendingNotes(selectedClimbLog?.notes || '')
      setNotesDialogOpen(true)
      addToast(`Logged as ${style === 'flash' ? 'Flash' : style === 'top' ? 'Top' : 'Try'}`, 'success')
      return true
    } catch {
      if (window.navigator.onLine === false && userId) {
        await queueMutation({ mutationId, userId, operationType: 'LOG_CLIMB', payload, createdAt })
        setPendingLogClimbIds((current) => new Set(current).add(targetClimbId))
        setSelectedClimbLogged(true)
        addToast('Climb logged locally. Pending sync.', 'success')
        return true
      }
      addToast('Could not log this climb. Check your signal and retry.', 'error')
      return false
    } finally {
      setLogging(false)
    }
  }, [activeClimbId, addToast, isOnline, queryClient, selectedClimbLog?.notes, setPendingNotes, setSelectedClimbFeedbackCollapsed, setSelectedClimbLogged, userId, userPresent])

  const applySavedFeedback = useCallback((payload: {
    updatedGrade?: string
    gradeUpdated?: boolean
    gradeOpinion?: GradeOpinion | null
    starRating?: number | null
    notes?: string | null
  }, fallback: { gradeOpinion?: GradeOpinion | null; starRating?: number | null }) => {
    setSelectedClimbLog({
      gradeOpinion: payload.gradeOpinion ?? fallback.gradeOpinion ?? null,
      starRating: payload.starRating ?? fallback.starRating ?? null,
      notes: payload.notes ?? (pendingNotes.trim() || null),
    })
    setSelectedClimbHasSavedFeedback(true)
    setSelectedClimbFeedbackCollapsed(true)

    if (activeClimbId && payload.gradeUpdated && payload.updatedGrade) {
      updateLocalClimbGrade(activeClimbId, payload.updatedGrade)
    }
  }, [activeClimbId, pendingNotes, setSelectedClimbFeedbackCollapsed, setSelectedClimbHasSavedFeedback, setSelectedClimbLog, updateLocalClimbGrade])

  const handleSaveFeedback = useCallback(async () => {
    if (!activeClimbId || !userPresent) return
    if (!pendingGradeOpinion && pendingStarRating === null && pendingNotes.trim().length === 0) return

    setSavingFeedback(true)
    try {
      const result = await saveClimbFeedbackAction({
        climbId: activeClimbId,
        gradeOpinion: pendingGradeOpinion,
        starRating: pendingStarRating,
        notes: pendingNotes.trim() || null,
      })

      if (!result.success) {
        addToast('Failed to save climb notes', 'error')
        return
      }

      const payload = (result.data || {}) as {
        updatedGrade?: string
        gradeUpdated?: boolean
        gradeOpinion?: GradeOpinion | null
        starRating?: number | null
        notes?: string | null
      }

      applySavedFeedback(payload, {
        gradeOpinion: pendingGradeOpinion,
        starRating: pendingStarRating,
      })
      setPendingNotes(payload.notes ?? pendingNotes.trim())
      setNotesDialogOpen(false)
      addToast('Saved climb notes', 'success')
    } finally {
      setSavingFeedback(false)
    }
  }, [activeClimbId, addToast, applySavedFeedback, pendingGradeOpinion, pendingNotes, pendingStarRating, setPendingNotes, userPresent])

  const handleGradeOpinionSelect = useCallback(async (gradeOpinion: GradeOpinion) => {
    if (!activeClimbId || !userPresent) return

    setPendingGradeOpinion(gradeOpinion)
    setSavingFeedback(true)
    try {
      const result = await saveClimbFeedbackAction({
        climbId: activeClimbId,
        gradeOpinion,
        starRating: pendingStarRating,
      })

      if (!result.success) {
        addToast('Failed to save grade feel', 'error')
        return
      }

      const payload = (result.data || {}) as {
        updatedGrade?: string
        gradeUpdated?: boolean
        gradeOpinion?: GradeOpinion | null
        starRating?: number | null
      }

      applySavedFeedback(payload, {
        gradeOpinion,
        starRating: pendingStarRating,
      })
      addToast('Saved grade feel', 'success')
    } finally {
      setSavingFeedback(false)
    }
  }, [activeClimbId, addToast, applySavedFeedback, pendingStarRating, setPendingGradeOpinion, userPresent])

  const handleStarRatingSelect = useCallback(async (starRating: number | null) => {
    if (!activeClimbId || !userPresent) return

    setPendingStarRating(starRating)
    setSavingFeedback(true)
    try {
      const result = await saveClimbFeedbackAction({
        climbId: activeClimbId,
        gradeOpinion: pendingGradeOpinion,
        starRating,
      })

      if (!result.success) {
        addToast('Failed to save climb rating', 'error')
        return
      }

      const payload = (result.data || {}) as {
        updatedGrade?: string
        gradeUpdated?: boolean
        gradeOpinion?: GradeOpinion | null
        starRating?: number | null
      }

      applySavedFeedback(payload, {
        gradeOpinion: pendingGradeOpinion,
        starRating,
      })
      addToast(starRating === null ? 'Cleared climb rating' : 'Saved climb rating', 'success')
    } finally {
      setSavingFeedback(false)
    }
  }, [activeClimbId, addToast, applySavedFeedback, pendingGradeOpinion, setPendingStarRating, userPresent])

  const handleGoToLogbook = useCallback(() => {
    router.push('/logbook')
  }, [router])

  const openShareUrl = (platform: 'x' | 'facebook' | 'whatsapp') => {
    if (!selectedClimb) return

    const pageUrl = window.location.href
    const shareText = `Check out ${selectedClimb.name}`
    const shareUrl = new URL(
      platform === 'x'
        ? 'https://x.com/intent/post'
        : platform === 'facebook'
          ? 'https://www.facebook.com/sharer/sharer.php'
          : 'https://wa.me/'
    )

    if (platform === 'x') {
      shareUrl.searchParams.set('text', shareText)
      shareUrl.searchParams.set('url', pageUrl)
    } else if (platform === 'facebook') {
      shareUrl.searchParams.set('u', pageUrl)
    } else {
      shareUrl.searchParams.set('text', `${shareText} ${pageUrl}`)
    }

    window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer')
    setShareOpen(false)
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      addToast('Climb link copied', 'success')
      setShareOpen(false)
    } catch {
      addToast('Could not copy climb link', 'error')
    }
  }

  const handleToggleWantToTry = useCallback(async () => {
    if (!activeClimbId) return
    if (!userPresent) {
      handleGoToAuth()
      return
    }

    const nextSaved = !isWantToTrySaved
    setIsWantToTrySaved(nextSaved)
    setSavingWantToTry(true)

    try {
      const result = nextSaved ? await saveClimbAction(activeClimbId) : await unsaveClimbAction(activeClimbId)
      if (!result.success) {
        setIsWantToTrySaved(!nextSaved)
        addToast(nextSaved ? 'Failed to save climb' : 'Failed to remove saved climb', 'error')
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ownLogbookSummaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ownLogbookSubmissionsQueryKey }),
      ])
      addToast(nextSaved ? 'Saved to Want to try' : 'Removed from Want to try', 'success')
    } finally {
      setSavingWantToTry(false)
    }
  }, [activeClimbId, addToast, handleGoToAuth, isWantToTrySaved, queryClient, setIsWantToTrySaved, userPresent])

  const handleDownloadInstagramPost = useCallback(async (mode: ExportMode) => {
    if (!isAdmin || !activeImageId || downloadingPost) return
    if (mode === 'selected-route' && !activeRouteId) {
      addToast('Select a route first for selected-route export', 'error')
      return
    }

    const params = new URLSearchParams({
      country: countryCode,
      crag: cragSlug,
      image: activeImageId,
      mode,
    })

    if (activeRouteId) {
      params.set('route', activeRouteId)
    }

    setDownloadingPost(true)
    setExportDialogOpen(false)
    try {
      const response = await fetch(`/api/social/instagram?${params.toString()}`)
      if (!response.ok) {
        addToast('Failed to generate Instagram post', 'error')
        return
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${cragSlug}-instagram-post.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
      addToast('Instagram post downloaded', 'success')
    } catch {
      addToast('Failed to download Instagram post', 'error')
    } finally {
      setDownloadingPost(false)
    }
  }, [activeImageId, activeRouteId, addToast, countryCode, cragSlug, downloadingPost, isAdmin])

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-14">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setExportDialogOpen(true)}
            disabled={!activeImageId || downloadingPost}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur disabled:opacity-30"
          >
            {downloadingPost ? 'Downloading...' : 'Download Post'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}
          disabled={isFirst}
          className="absolute left-3 z-10 rounded-full bg-white/15 px-3 py-2 text-sm text-white backdrop-blur disabled:opacity-30"
        >
          Prev
        </button>

        <ImageFirstCanvasCarousel
          emblaRef={emblaRef}
          orderedImageIds={navigationContext.orderedImageIds}
          imageMap={navigationContext.imageMap}
          activeImageIndex={activeImageIndex}
          activeImageId={activeImageId}
          activeCanvasImageUrl={activeCanvasImageUrl}
          activeRouteId={activeRouteId}
          heroPriority={heroImage.priority}
          visibleRoutes={visibleRoutes}
          onRouteSelect={handleRouteSelect}
        />

        <button
          type="button"
          onClick={() =>
            setActiveImageIndex(
              Math.min(navigationContext.orderedImageIds.length - 1, activeImageIndex + 1)
            )
          }
          disabled={isLast}
          className="absolute right-3 z-10 rounded-full bg-white/15 px-3 py-2 text-sm text-white backdrop-blur disabled:opacity-30"
        >
          Next
        </button>
      </main>

      <ImageFirstFooterRail visibleRoutes={visibleRoutes} activeRouteId={activeRouteId} onRouteSelect={handleRouteSelect} />

      <ClimbInfoPanel
        selectedClimb={selectedClimb}
        selectedRouteExists={!!activeRouteId}
        canEditRoute={!!selectedClimb && !!activePrimaryImageId && !!resolvedActiveRouteId}
        canAddRoutes={!!activePrimaryImageId && visibleRoutes.length === 0}
        totalRoutesCombined={allRoutesFlat.length}
        totalFaces={navigationContext.orderedImageIds.length}
        isFacesLoading={false}
        cragPath={`/${countryCode}/${cragSlug}`}
        attribution={payload.attribution}
        imageLatitude={null}
        imageLongitude={null}
        selectedClimbLogged={selectedClimbLogged}
        selectedClimbPendingSync={pendingLogClimbIds.has(activeClimbId ?? '')}
        selectedClimbLog={selectedClimbLog}
        selectedClimbHasSavedFeedback={selectedClimbHasSavedFeedback}
        selectedClimbFeedbackCollapsed={selectedClimbFeedbackCollapsed}
        selectedClimbRatingSummary={selectedClimbRatingSummary}
        selectedClimbAverageRating={selectedClimbRatingSummary?.rating_avg ?? null}
        selectedClimbRoundedStars={Math.round(selectedClimbRatingSummary?.rating_avg ?? 0)}
        pendingGradeOpinion={pendingGradeOpinion}
        pendingStarRating={pendingStarRating}
        communityNotesCount={communityNotesCount}
        communityNotes={communityNotes}
        communityNotesExpanded={communityNotesExpanded}
        savingFeedback={savingFeedback}
        logging={logging}
        loggingOnline={isOnline === true}
        savingWantToTry={savingWantToTry}
        loadingSelectedClimbState={loadingSelectedClimbState}
        userPresent={userPresent || !hasHydratedAuth}
        isWantToTrySaved={isWantToTrySaved}
        gradeSystem={gradeSystem}
        gradeOpinionLabels={{ soft: 'Soft', agree: 'Agree', hard: 'Hard' }}
        formatRouteTypeLabel={(value) => value}
        onEditRoute={handleEditRoute}
        onAddRoutes={handleAddRoutes}
        onOpenFlag={() => setFlagOpen(true)}
        onShare={() => setShareOpen(true)}
        onGoToAuth={handleGoToAuth}
        onToggleWantToTry={handleToggleWantToTry}
        onLog={handleLog}
        onSetFeedbackCollapsed={setSelectedClimbFeedbackCollapsed}
        onSetPendingGradeOpinion={handleGradeOpinionSelect}
        onSetPendingStarRating={handleStarRatingSelect}
        onToggleCommunityNotesExpanded={() => setCommunityNotesExpanded((current) => !current)}
        onSaveFeedback={handleSaveFeedback}
        onGoToLogbook={handleGoToLogbook}
        deferredSections={<ImageFirstDeferredSections activeClimbId={activeClimbId} />}
      />

      {selectedClimb && flagOpen ? (
        <FlagClimbModal
          climbId={selectedClimb.id}
          climbName={selectedClimb.name}
          onClose={() => setFlagOpen(false)}
        />
      ) : null}

      <ClimbShareDialog
        open={shareOpen}
        climbName={selectedClimb?.name ?? ''}
        onOpenChange={setShareOpen}
        onCopyLink={() => void handleCopyShareLink()}
        onShareTwitter={() => openShareUrl('x')}
        onShareFacebook={() => openShareUrl('facebook')}
        onShareWhatsApp={() => openShareUrl('whatsapp')}
      />

      {(() => {
        const shouldRender = mapPins.length > 0 && mapInitialCenter
        return shouldRender ? (
          <div className="px-4 pb-4">
            <div className="mx-auto w-full max-w-6xl">
              <LightweightCragMap
                pins={mapPins}
                activePinId={activeImageId}
                initialCenter={mapInitialCenter}
                initialZoom={18}
                onPinSelect={handleSelectImage}
                disableClustering={true}
                disableAutoFit={true}
                showUserLocation={true}
                heightClassName="h-[240px] md:h-[280px]"
              />
              <SelectedPinImageRail
                pin={selectedMapPin}
                activeImageId={activeImageId}
                imageMap={navigationContext.imageMap}
                onSelectImage={handleSelectImage}
              />
            </div>
          </div>
        ) : null
      })()}

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Post</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Choose what gets rendered into the export image.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void handleDownloadInstagramPost('image')}
              disabled={downloadingPost}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-white">Image only</div>
              <div className="mt-1 text-sm text-zinc-400">Clean portrait crop for adding text later in Canva.</div>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadInstagramPost('selected-route')}
              disabled={downloadingPost || !activeRouteId}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-white">Selected route</div>
              <div className="mt-1 text-sm text-zinc-400">Exports only the currently selected route overlay.</div>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadInstagramPost('all-routes')}
              disabled={downloadingPost}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-white">All routes</div>
              <div className="mt-1 text-sm text-zinc-400">Exports all routes in red with the selected route highlighted in cyan.</div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add notes for this send</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Save private notes now, or skip and add them later from your logbook.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <textarea
              value={pendingNotes}
              onChange={(event) => setPendingNotes(event.target.value)}
              placeholder="How did it feel? Conditions, beta, links, or reminders for next time."
              className="min-h-32 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/20"
              maxLength={500}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNotesDialogOpen(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => void handleSaveFeedback()}
                disabled={savingFeedback}
                className="flex-1 rounded-2xl bg-[#d4a017] px-4 py-3 text-sm font-semibold text-black transition hover:brightness-105 disabled:opacity-50"
              >
                Save notes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
