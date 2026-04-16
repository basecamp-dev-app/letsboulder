'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { useImageNavigation } from '@/features/image-first/hooks/use-image-navigation'
import { ImageFirstCanvasCarousel, ImageFirstDeferredSections, ImageFirstFooterRail } from '@/features/image-first/components/image-first-sections'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/features/image-first/types'
import { normalizePoints } from '@/lib/canvasMath'
import type { Database } from '@/types/database'
import { createClient } from '@/lib/supabase'
import type { RouteLine, RoutePoint } from '@/types/domain'
import ClimbInfoPanel from '@/features/climb/components/ClimbInfoPanel'
import { saveClimbFeedbackAction } from '@/features/climb/actions/save-climb-feedback'
import { getGradeSystemForClimbType, useGradePreferences } from '@/lib/grades/preferences'
import { logRoutesAction } from '@/features/logbook/actions/log-routes'
import type { GradeOpinion } from '@/lib/grade-feedback'
import { parseRoutePoints } from '@/features/route-editor/route-editor-utils'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import LightweightCragMap from '@/components/LightweightCragMap'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ExportMode = 'image' | 'selected-route' | 'all-routes'

type UserClimbRow = Database['public']['Tables']['user_climbs']['Row']

function toLoggedClimbInfo(row: UserClimbRow | null): { gradeOpinion: 'soft' | 'agree' | 'hard' | null; starRating: number | null; notes: string | null } | null {
  if (!row) return null
  return {
    gradeOpinion: row.grade_opinion === 'soft' || row.grade_opinion === 'agree' || row.grade_opinion === 'hard'
      ? row.grade_opinion
      : null,
    starRating: row.star_rating,
    notes: row.notes,
  }
}

export default function ImageFirstClient({ payload }: { payload: ImageFirstPayload }) {
  const {
    heroImage,
    initialRoutes,
    navigationContext,
    initialClimbId,
    initialRouteId,
    initialRouteSlug,
    countryCode,
    cragSlug,
    isAdmin,
  } = payload
  const { linkedImageIdByDisplayId } = navigationContext
  const router = useRouter()
  const pathname = usePathname()
  const gradePreferences = useGradePreferences()
  const { toasts, addToast, removeToast } = useToast()
  const [hasHydratedAuth, setHasHydratedAuth] = useState(false)
  const [userPresent, setUserPresent] = useState(false)
  const [selectedClimbLogged, setSelectedClimbLogged] = useState(false)
  const [selectedClimbLog, setSelectedClimbLog] = useState<{ gradeOpinion: GradeOpinion | null; starRating: number | null; notes: string | null } | null>(null)
  const [communityNotesCount, setCommunityNotesCount] = useState(0)
  const [communityNotes, setCommunityNotes] = useState<Array<{ userId: string; displayName: string; notes: string }>>([])
  const [selectedClimbHasSavedFeedback, setSelectedClimbHasSavedFeedback] = useState(false)
  const [selectedClimbFeedbackCollapsed, setSelectedClimbFeedbackCollapsed] = useState(true)
  const [pendingGradeOpinion, setPendingGradeOpinion] = useState<GradeOpinion | null>(null)
  const [pendingStarRating, setPendingStarRating] = useState<number | null>(null)
  const [pendingNotes, setPendingNotes] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [logging, setLogging] = useState(false)
  const [downloadingPost, setDownloadingPost] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, ImageFirstRouteLine[]>>(() => {
    const primaryId = linkedImageIdByDisplayId[heroImage.displayImageId] || heroImage.displayImageId
    return { [primaryId]: initialRoutes }
  })

  const {
    activeImageIndex,
    activeImageId,
    activeRouteId,
    activeClimbId,
    emblaRef,
    setActiveImageIndex,
    setUserSelectedRouteId,
    isFirst,
    isLast,
  } = useImageNavigation({
    orderedImageIds: navigationContext.orderedImageIds,
    startIndex: navigationContext.startIndex,
    initialRoutes,
    initialRouteId,
    initialRouteSlug,
    initialClimbId,
    linkedImageIdByDisplayId,
    countryCode,
    cragSlug,
    stacks: navigationContext.stacks,
    sectorMarkers: navigationContext.sectorMarkers,
  })

  useEffect(() => {
    const supabase = createClient()

    const syncUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUserPresent(!!user)
      setHasHydratedAuth(true)
    }

    void syncUser()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUserPresent(!!session?.user)
      setHasHydratedAuth(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const otherImageIds = useMemo(
    () => navigationContext.orderedImageIds.filter((id) => id !== heroImage.displayImageId),
    [navigationContext.orderedImageIds, heroImage.displayImageId]
  )

  const allRouteImageIds = useMemo(() => {
    const ids = new Set<string>()
    for (const displayId of otherImageIds) {
      ids.add(displayId)
      const linkedId = linkedImageIdByDisplayId[displayId]
      if (linkedId && linkedId !== displayId) {
        ids.add(linkedId)
      }
    }
    return Array.from(ids)
  }, [otherImageIds, linkedImageIdByDisplayId])

  useEffect(() => {
    if (allRouteImageIds.length === 0) return

    const supabase = createClient()
    let cancelled = false

    const fetchAllRoutes = async () => {
      const { data, error } = await supabase
        .from('route_lines')
        .select(
          'id, image_id, climb_id, color, points, image_width, image_height, sequence_order, created_at, climbs (id, name, slug, grade, description, route_type)'
        )
        .in('image_id', allRouteImageIds)
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (cancelled || error || !data) return

      const grouped: Record<string, ImageFirstRouteLine[]> = {}
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
          average_stars: number | null
          star_votes: number | null
        } | Array<{
          id: string
          name: string | null
          slug: string | null
          grade: string | null
          description: string | null
          route_type: string | null
          average_stars: number | null
          star_votes: number | null
        }> | null
      }>) {
        const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
        if (!row.image_id || !climb) continue

        const route: ImageFirstRouteLine = {
          routeId: row.id,
          climbId: row.climb_id,
          imageId: row.image_id,
          climbSlug: climb.slug || null,
          climbName: climb.name || 'Unnamed route',
          climbGrade: climb.grade || null,
          climbDescription: climb.description || null,
          climbRouteType: climb.route_type || null,
          climbAverageStars: climb.average_stars ?? null,
          climbStarVotes: climb.star_votes ?? null,
          pathData: row.points,
          color: row.color || '#ef4444',
          isPrimary: false,
        }

        if (!grouped[row.image_id]) grouped[row.image_id] = []
        grouped[row.image_id].push(route)
      }

      if (cancelled) return
      setRoutesByImageId((prev) => ({ ...prev, ...grouped }))
    }

    void fetchAllRoutes()
    return () => { cancelled = true }
  }, [allRouteImageIds])

  useEffect(() => {
    if (!activeClimbId) {
      setSelectedClimbLogged(false)
      setSelectedClimbLog(null)
      setSelectedClimbHasSavedFeedback(false)
      setSelectedClimbFeedbackCollapsed(true)
      setPendingGradeOpinion(null)
      setPendingStarRating(null)
      setCommunityNotesCount(0)
      setCommunityNotes([])
      return
    }

    const supabase = createClient()
    let cancelled = false

    const fetchData = async () => {
      const { data: notesData, error: notesError } = await supabase
        .from('user_climbs')
        .select('user_id, notes')
        .eq('climb_id', activeClimbId)
        .not('notes', 'is', null)
        .limit(10)

      const notesCount = notesData?.length ?? 0
      if (!cancelled) {
        setCommunityNotesCount(notesCount)
      }

      if (notesData && notesData.length > 0) {
        const userIds = [...new Set(notesData.map((n: { user_id: string }) => n.user_id))]
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
          .limit(10)

        const profileMap = new Map(profilesData?.map((p: { id: string; display_name: string }) => [p.id, p.display_name]) || [])
        const notesWithNames = notesData
          .map((n: { user_id: string; notes: string }) => ({
            userId: n.user_id,
            displayName: profileMap.get(n.user_id) || 'Anonymous',
            notes: n.notes,
          }))
          .filter((n: { notes: string }) => n.notes)

        if (!cancelled) {
          setCommunityNotes(notesWithNames)
        }
      } else if (!cancelled) {
        setCommunityNotes([])
      }

      if (!userPresent) return

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return

      const { data, error } = await supabase
        .from('user_climbs')
        .select('grade_opinion, star_rating, notes')
        .eq('user_id', userId)
        .eq('climb_id', activeClimbId)
        .maybeSingle()

      if (cancelled || error) return

      const log = toLoggedClimbInfo(data)
      setSelectedClimbLogged(!!data)
      setSelectedClimbLog(log)
      setSelectedClimbHasSavedFeedback(!!data && (!!log?.gradeOpinion || log?.starRating !== null || !!log?.notes))
      setSelectedClimbFeedbackCollapsed(!!data)
      setPendingGradeOpinion(log?.gradeOpinion ?? null)
      setPendingStarRating(log?.starRating ?? null)
    }

    void fetchData()
    return () => { cancelled = true }
  }, [activeClimbId, userPresent])

  const allRoutesFlat = useMemo(
    () => Object.values(routesByImageId).flat(),
    [routesByImageId]
  )

  const selectedClimb = useMemo(() => {
    const activeRoute = allRoutesFlat.find((route) => route.routeId === activeRouteId)
    if (!activeRoute) return null
    return {
      id: activeRoute.climbId,
      name: activeRoute.climbName,
      grade: activeRoute.climbGrade || 'Unknown',
      route_type: activeRoute.climbRouteType,
      description: activeRoute.climbDescription,
    }
  }, [activeRouteId, allRoutesFlat])

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

  const activeRouteMeta = useMemo(
    () => allRoutesFlat.find((route) => route.routeId === activeRouteId) || null,
    [activeRouteId, allRoutesFlat]
  )

  const activeImageMeta = useMemo(
    () => activeImageId ? navigationContext.imageMap[activeImageId] || heroImage : heroImage,
    [activeImageId, navigationContext.imageMap, heroImage]
  )
  const activeCanvasImageUrl = activeImageMeta.src || heroImage.src

  const mapPins = useMemo(() => {
    return payload.mapPins.map((pin) => ({
      id: pin.imageId,
      latitude: pin.latitude,
      longitude: pin.longitude,
      label: String(pin.activeImageIds.length),
      activeImageIds: pin.activeImageIds,
    }))
  }, [payload.mapPins])

  const visibleRoutes = useMemo(() => {
    const displayImageId = activeImageId || heroImage.displayImageId
    const primaryImageId = linkedImageIdByDisplayId[displayImageId] || displayImageId
    const rawRoutes = routesByImageId[primaryImageId] || []
    const filteredRoutes = rawRoutes.filter(route => route.imageId === primaryImageId)

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
  }, [routesByImageId, activeImageId, activeImageMeta, heroImage.displayImageId, linkedImageIdByDisplayId])

  const handleGoToAuth = () => {
    router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/${countryCode}/${cragSlug}/i/${heroImage.displayImageId}`)}`)
  }

  const handleRouteSelect = useCallback((routeId: string | null) => {
    if (routeId) {
      setUserSelectedRouteId(routeId)
    }
  }, [setUserSelectedRouteId])

  const handleLog = useCallback(async (style: 'flash' | 'top' | 'try', notes?: string) => {
    if (!activeClimbId || !userPresent) return false

    setLogging(true)
    try {
      const result = await logRoutesAction([activeClimbId], style, notes || undefined)
      if (!result.success) {
        addToast('Failed to log climb', 'error')
        return false
      }

      setSelectedClimbLogged(true)
      setSelectedClimbFeedbackCollapsed(false)
      setPendingNotes('')
      addToast(`Logged as ${style === 'flash' ? 'Flash' : style === 'top' ? 'Top' : 'Try'}`, 'success')
      return true
    } finally {
      setLogging(false)
    }
  }, [activeClimbId, addToast, userPresent])

  const applySavedFeedback = useCallback((payload: {
    updatedGrade?: string
    gradeUpdated?: boolean
    gradeOpinion?: GradeOpinion | null
    starRating?: number | null
  }, fallback: { gradeOpinion?: GradeOpinion | null; starRating?: number | null }) => {
    setSelectedClimbLog({
      gradeOpinion: payload.gradeOpinion ?? fallback.gradeOpinion ?? null,
      starRating: payload.starRating ?? fallback.starRating ?? null,
      notes: null,
    })
    setSelectedClimbHasSavedFeedback(true)
    setSelectedClimbFeedbackCollapsed(true)

    if (activeClimbId && payload.gradeUpdated && payload.updatedGrade) {
      updateLocalClimbGrade(activeClimbId, payload.updatedGrade)
    }
  }, [activeClimbId, updateLocalClimbGrade])

  const handleSaveFeedback = useCallback(async () => {
    if (!activeClimbId || !userPresent) return
    if (!pendingGradeOpinion && pendingStarRating === null) return

    setSavingFeedback(true)
    try {
      const result = await saveClimbFeedbackAction({
        climbId: activeClimbId,
        gradeOpinion: pendingGradeOpinion,
        starRating: pendingStarRating,
      })

      if (!result.success) return

      const payload = (result.data || {}) as {
        updatedGrade?: string
        gradeUpdated?: boolean
        gradeOpinion?: GradeOpinion | null
        starRating?: number | null
      }

      applySavedFeedback(payload, {
        gradeOpinion: pendingGradeOpinion,
        starRating: pendingStarRating,
      })
    } finally {
      setSavingFeedback(false)
    }
  }, [activeClimbId, applySavedFeedback, pendingGradeOpinion, pendingStarRating, userPresent])

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
  }, [activeClimbId, addToast, applySavedFeedback, pendingStarRating, userPresent])

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
  }, [activeClimbId, addToast, applySavedFeedback, pendingGradeOpinion, userPresent])

  const handleGoToLogbook = useCallback(() => {
    router.push('/logbook')
  }, [router])

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

      {mapPins.length > 0 ? (
        <div className="px-4 pb-4">
          <div className="mx-auto w-full max-w-6xl">
            <LightweightCragMap
              pins={mapPins}
              activePinId={activeImageId}
              onPinSelect={(imageId) => {
                const nextIndex = navigationContext.orderedImageIds.indexOf(imageId)
                if (nextIndex >= 0) setActiveImageIndex(nextIndex)
              }}
              heightClassName="min-h-[240px] md:min-h-[280px]"
            />
          </div>
        </div>
      ) : null}

      <ClimbInfoPanel
        selectedClimb={selectedClimb}
        selectedRouteExists={!!activeRouteId}
        totalRoutesCombined={allRoutesFlat.length}
        totalFaces={navigationContext.orderedImageIds.length}
        isFacesLoading={false}
        cragPath={`/${countryCode}/${cragSlug}`}
        isOfflineSaved={false}
        offlinePackAvailable={false}
        publicSubmitter={null}
        formattedContributionHandle={null}
        contributionCreditUrl={null}
        imageLatitude={null}
        imageLongitude={null}
        selectedClimbLogged={selectedClimbLogged}
        selectedClimbLog={selectedClimbLog}
        selectedClimbHasSavedFeedback={selectedClimbHasSavedFeedback}
        selectedClimbFeedbackCollapsed={selectedClimbFeedbackCollapsed}
        selectedClimbRatingSummary={
          activeRouteMeta
            ? {
                rating_avg: activeRouteMeta.climbAverageStars,
                rating_count: activeRouteMeta.climbStarVotes ?? 0,
              }
            : null
        }
        selectedClimbAverageRating={activeRouteMeta?.climbAverageStars ?? null}
        selectedClimbRoundedStars={Math.round(activeRouteMeta?.climbAverageStars ?? 0)}
        pendingGradeOpinion={pendingGradeOpinion}
        pendingStarRating={pendingStarRating}
        pendingNotes={pendingNotes}
        communityNotesCount={communityNotesCount}
        communityNotes={communityNotes}
        savingFeedback={savingFeedback}
        logging={logging}
        userPresent={hasHydratedAuth ? userPresent : true}
        gradeSystem={gradeSystem}
        gradeOpinionLabels={{ soft: 'Soft', agree: 'Agree', hard: 'Hard' }}
        formatRouteTypeLabel={(value) => value}
        onOpenOffline={() => undefined}
        onOpenFlag={() => undefined}
        onShare={() => undefined}
        onGoToAuth={handleGoToAuth}
        onLog={handleLog}
        onSetFeedbackCollapsed={setSelectedClimbFeedbackCollapsed}
        onSetPendingGradeOpinion={handleGradeOpinionSelect}
        onSetPendingStarRating={handleStarRatingSelect}
        onSetPendingNotes={setPendingNotes}
        onSaveFeedback={handleSaveFeedback}
        onGoToLogbook={handleGoToLogbook}
        deferredSections={<ImageFirstDeferredSections activeClimbId={activeClimbId} />}
      />

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
    </div>
  )
}
