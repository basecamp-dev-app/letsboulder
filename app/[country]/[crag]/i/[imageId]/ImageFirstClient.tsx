'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { useImageNavigation } from '@/app/[country]/[crag]/i/[imageId]/useImageNavigation'
import type { ImageFirstPayload, ImageFirstRouteLine } from '@/app/[country]/[crag]/i/[imageId]/image-page-server'
import { RouteEditorRail } from '@/components/RouteEditorRail'
import { UnifiedRouteCanvas } from '@/components/UnifiedRouteCanvas'
import LightweightCragMap from '@/components/lightweight-crag-map'
import { normalizePoints } from '@/lib/canvasMath'
import { createClient } from '@/lib/supabase'
import type { RouteLine, RoutePoint } from '@/types/domain'
import ClimbInfoPanel from '@/app/climb/components/ClimbInfoPanel'

function parsePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
      .map((point) => ({ x: point.x, y: point.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
      .map((point) => ({ x: point.x, y: point.y }))
  } catch {
    return []
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
  } = payload
  const router = useRouter()
  const pathname = usePathname()
  const [hasHydratedAuth, setHasHydratedAuth] = useState(false)
  const [userPresent, setUserPresent] = useState(false)
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, ImageFirstRouteLine[]>>(
    () => ({ [heroImage.displayImageId]: initialRoutes })
  )
  const [loadedImageElement, setLoadedImageElement] = useState<HTMLImageElement | null>(null)

  const {
    activeImageIndex,
    activeImageId,
    activeRouteId,
    activeClimbId,
    activeSector,
    activeStack,
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

  useEffect(() => {
    if (otherImageIds.length === 0) return

    const supabase = createClient()
    let cancelled = false

    const fetchAllRoutes = async () => {
      const { data, error } = await supabase
        .from('route_lines')
        .select(
          'id, image_id, climb_id, color, points, image_width, image_height, sequence_order, created_at, climbs (id, name, slug, grade, description, route_type)'
        )
        .in('image_id', otherImageIds)
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
  }, [otherImageIds])

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

  const activeRouteMeta = useMemo(
    () => allRoutesFlat.find((route) => route.routeId === activeRouteId) || null,
    [activeRouteId, allRoutesFlat]
  )

  const activeImageMeta = activeImageId
    ? navigationContext.imageMap[activeImageId] || heroImage
    : heroImage
  const activeCanvasImageUrl = activeImageMeta.src || heroImage.src

  const mapPins = useMemo(() => {
    return payload.mapPins.map((pin, index) => ({
      id: pin.imageId,
      latitude: pin.latitude,
      longitude: pin.longitude,
      label: String(index + 1),
    }))
  }, [payload.mapPins])

  const visibleRoutes = useMemo(() => {
    const targetImageId = activeImageId || heroImage.displayImageId
    const routes = routesByImageId[targetImageId] || []

    return routes.map((route) => {
      const rawPoints = parsePoints(route.pathData)
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
  }, [routesByImageId, activeImageId, activeImageMeta, heroImage.displayImageId])

  const handleGoToAuth = () => {
    router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/${countryCode}/${cragSlug}/i/${heroImage.displayImageId}`)}`)
  }

  const handleRouteSelect = useCallback((routeId: string | null) => {
    if (routeId) {
      setUserSelectedRouteId(routeId)
    }
  }, [setUserSelectedRouteId])

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
        <div className="text-sm text-white/80">
          {cragSlug}
          {activeSector ? ` / ${activeSector.name}` : ''}
          {' / '}
          Image {activeImageIndex + 1} of {navigationContext.orderedImageIds.length}
          {activeStack && activeStack.imageIds.length > 1
            ? ` / Stack ${activeStack.imageIds.indexOf(activeImageId || '') + 1} of ${activeStack.imageIds.length}`
            : ''}
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-14">
        <button
          type="button"
          onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}
          disabled={isFirst}
          className="absolute left-3 z-10 rounded-full bg-white/15 px-3 py-2 text-sm text-white backdrop-blur disabled:opacity-30"
        >
          Prev
        </button>

        <div className="w-full max-w-6xl overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {navigationContext.orderedImageIds.map((imageId, index) => {
              const imageMeta = navigationContext.imageMap[imageId]
              if (!imageMeta) return null
              const isActive = index === activeImageIndex

              return (
                <div
                  key={imageId}
                  className="relative min-w-0 shrink-0 grow-0 basis-full"
                >
                  <div className="relative h-[60vh] w-full">
                    <Image
                      src={isActive ? activeCanvasImageUrl : imageMeta.src}
                      alt="Crag viewer"
                      fill
                      priority={isActive ? heroImage.priority : false}
                      className="object-contain"
                      loading={isActive ? 'eager' : 'lazy'}
                      onLoad={(e) => {
                        const img = e.currentTarget as HTMLImageElement
                        setLoadedImageElement(img)
                      }}
                    />
                                        {isActive && loadedImageElement && (
                      <>
                        <div className="hidden print:block">Canvas URL: {activeCanvasImageUrl}</div>
                        <UnifiedRouteCanvas
                          key={activeImageId}
                          mode="browse"
                          imageUrl={activeCanvasImageUrl}
                          preloadedImage={loadedImageElement}
                          routes={visibleRoutes}
                          activeRouteId={activeRouteId}
                          onRouteSelect={handleRouteSelect}
                        />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

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

      <div className="px-4 pb-4">
        <div className="mx-auto w-full max-w-6xl">
          <RouteEditorRail
            routes={visibleRoutes}
            selectedRouteId={activeRouteId}
            gradeSystem={'font_scale'}
            onSelectRoute={handleRouteSelect}
          />
        </div>
      </div>

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
        selectedClimbLogged={false}
        selectedClimbLog={null}
        selectedClimbHasSavedFeedback={false}
        selectedClimbFeedbackCollapsed={true}
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
        pendingGradeOpinion={null}
        pendingStarRating={null}
        savingFeedback={false}
        logging={false}
        userPresent={hasHydratedAuth ? userPresent : true}
        gradeSystem={'font' as never}
        gradeOpinionLabels={{ soft: 'Soft', agree: 'Agree', hard: 'Hard' }}
        formatRouteTypeLabel={(value) => value}
        onOpenOffline={() => undefined}
        onOpenFlag={() => undefined}
        onShare={() => undefined}
        onGoToAuth={handleGoToAuth}
        onLog={() => undefined}
        onSetFeedbackCollapsed={() => undefined}
        onSetPendingGradeOpinion={() => undefined}
        onSetPendingStarRating={() => undefined}
        onSaveFeedback={() => undefined}
        onGoToLogbook={() => undefined}
        deferredSections={
          <>
            {mapPins.length > 0 ? (
              <LightweightCragMap
                className="mt-4"
                pins={mapPins}
                activePinId={activeImageId}
                onPinSelect={(imageId) => {
                  const nextIndex = navigationContext.orderedImageIds.indexOf(imageId)
                  if (nextIndex >= 0) {
                    setActiveImageIndex(nextIndex)
                  }
                }}
                heightClassName="min-h-[220px]"
              />
            ) : null}
            {!activeClimbId ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                  Overview
                </div>
                <p className="mt-2">
                  Select a route line to view details, or keep swiping to explore this area.
                </p>
              </div>
            ) : null}
          </>
        }
      />
    </div>
  )
}
