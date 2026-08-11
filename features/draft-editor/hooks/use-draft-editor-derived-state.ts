'use client'

import { useMemo } from 'react'
import { coordinateKey } from '@/lib/face-directions'
import { buildMapPins, resolveLocationMode } from '@/features/submissions/public-client'
import { buildHighResCanvasUrl } from '@/features/route-editor/public'
import { buildDraftRouteLines, isValidLocationCoordinate, resolveEffectiveDraftPublishLocation, type DraftRoute, type ManageImageTab } from '@/features/draft-editor/lib/edit-draft-types'
import type { ImageSelection } from '@/features/submissions/public-client'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'

interface UseDraftEditorDerivedStateParams {
  activeImageId: string | null
  canvasSource: { kind: 'draft-image'; draftImageId: string } | { kind: 'crag-image'; cragImageId: string; cragId: string } | null
  mergedCragCanvasImages: ManageImageTab[]
  mergedManageImages: ManageImageTab[]
  pendingCragUploads: Array<{ clientId: string; progress: number }>
  pendingDraftUploads: Array<{ clientId: string; progress: number }>
  defaultImageId: string | null
  publishedCragPins: Array<{ id: string; latitude: number; longitude: number }>
  locationModeByImageId: Record<string, 'shared' | 'custom' | undefined>
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null } | undefined>
  routesByImageId: Record<string, DraftRoute[]>
  routeType: string
  cragCanvasImages: Array<{ id: string; linked_image_id: string | null; width: number | null; height: number | null }>
  markerPosition: [number, number] | null
}

export function useDraftEditorDerivedState(params: UseDraftEditorDerivedStateParams) {
  const {
    activeImageId,
    canvasSource,
    mergedCragCanvasImages,
    mergedManageImages,
    pendingCragUploads,
    pendingDraftUploads,
    defaultImageId,
    publishedCragPins,
    locationModeByImageId,
    customGpsByImageId,
    routesByImageId,
    routeType,
    cragCanvasImages,
    markerPosition,
  } = params

  const activeImageTab = useMemo(() => {
    if (!activeImageId) return null
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    return sourceImages.find((image) => image.imageId === activeImageId) || null
  }, [activeImageId, canvasSource, mergedCragCanvasImages, mergedManageImages])

  const activeDraftImageId = activeImageTab?.imageId || null
  const activeImageLocationMode = activeDraftImageId ? resolveLocationMode(locationModeByImageId[activeDraftImageId]) : 'shared'
  const pendingActiveImageCustomGps = activeDraftImageId ? customGpsByImageId[activeDraftImageId] : undefined
  const pendingActiveImageCustomPosition = useMemo<[number, number] | null>(() => {
    if (!activeDraftImageId || activeImageLocationMode !== 'custom') return null
    if (!pendingActiveImageCustomGps || !isValidLocationCoordinate(pendingActiveImageCustomGps.latitude, pendingActiveImageCustomGps.longitude)) return null
    return [pendingActiveImageCustomGps.latitude as number, pendingActiveImageCustomGps.longitude as number]
  }, [activeDraftImageId, activeImageLocationMode, pendingActiveImageCustomGps])

  const activeRoutes = useMemo(() => {
    if (!activeDraftImageId) return []
    return routesByImageId[activeDraftImageId] || []
  }, [activeDraftImageId, routesByImageId])

  const existingRouteLines = useMemo(() => buildDraftRouteLines(activeRoutes, activeDraftImageId, routeType), [activeRoutes, activeDraftImageId, routeType])

  const imageSelection = useMemo<ImageSelection | null>(() => {
    if (!activeImageTab) return null
    if (activeImageTab.sourceKind === 'crag-image') {
      const selectedCragImage = cragCanvasImages.find((image) => image.id === activeImageTab.imageId) || null
      return {
        mode: 'crag-image',
        cragImageId: activeImageTab.imageId,
        imageUrl: buildHighResCanvasUrl(activeImageTab.signedUrl),
        linkedImageId: selectedCragImage?.linked_image_id || null,
        width: selectedCragImage?.width || null,
        height: selectedCragImage?.height || null,
      }
    }
    return {
      mode: 'existing',
      imageId: activeImageTab.imageId,
      imageUrl: buildHighResCanvasUrl(activeImageTab.signedUrl),
    }
  }, [activeImageTab, cragCanvasImages])

  const stableActiveImageUrl = imageSelection && 'imageUrl' in imageSelection ? imageSelection.imageUrl : ''
  const activeImageReady = Boolean(activeImageTab?.signedUrl) && (!activeImageTab?.status || activeImageTab.status === 'READY')

  const quickSwitcherImages = useMemo(() => {
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    const pendingUploads = canvasSource?.kind === 'crag-image' ? pendingCragUploads : pendingDraftUploads
    return sourceImages
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((image: ManageImageTab) => ({
        ...image,
        badgeNumber: image.index + 1,
        isDefault: image.sourceKind === 'draft-image' && image.imageId === defaultImageId,
        progress: image.pendingClientId ? (pendingUploads.find((upload) => upload.clientId === image.pendingClientId)?.progress || 0) : undefined,
      }))
  }, [canvasSource, defaultImageId, mergedCragCanvasImages, mergedManageImages, pendingCragUploads, pendingDraftUploads])

  const draftMapPins = useMemo<LightweightCragMapPin[]>(() => {
    return buildMapPins(quickSwitcherImages.map((image) => ({
      imageId: image.imageId,
      order: image.badgeNumber - 1,
      label: image.label,
      latitude: image.latitude,
      longitude: image.longitude,
      locationMode: resolveLocationMode(image.locationMode),
    }))).map((pin) => {
      const sourceImage = quickSwitcherImages.find((image) => image.imageId === pin.id)
      return { ...pin, tone: sourceImage?.sourceKind === 'crag-image' ? 'published' : 'draft' }
    })
  }, [quickSwitcherImages])

  const publishedMapPins = useMemo<LightweightCragMapPin[]>(() => {
    const draftCoordinateKeys = new Set(
      quickSwitcherImages
        .filter((image) => typeof image.latitude === 'number' && typeof image.longitude === 'number')
        .map((image) => coordinateKey(image.latitude as number, image.longitude as number))
    )
    const seenPublishedCoordinates = new Set<string>()
    return publishedCragPins.reduce<LightweightCragMapPin[]>((acc, image) => {
      const key = coordinateKey(image.latitude, image.longitude)
      if (draftCoordinateKeys.has(key) || seenPublishedCoordinates.has(key)) return acc
      seenPublishedCoordinates.add(key)
      acc.push({ id: `published-${image.id}`, latitude: image.latitude, longitude: image.longitude, interactive: false, tone: 'published' })
      return acc
    }, [])
  }, [publishedCragPins, quickSwitcherImages])

  const effectiveMarkerPosition = pendingActiveImageCustomPosition || markerPosition
  const effectivePublishLocation = useMemo<[number, number] | null>(
    () => resolveEffectiveDraftPublishLocation(effectiveMarkerPosition, mergedManageImages),
    [effectiveMarkerPosition, mergedManageImages]
  )

  return {
    activeImageTab,
    activeDraftImageId,
    activeImageLocationMode,
    pendingActiveImageCustomPosition,
    activeRoutes,
    existingRouteLines,
    imageSelection,
    stableActiveImageUrl,
    activeImageReady,
    quickSwitcherImages,
    draftMapPins,
    publishedMapPins,
    effectiveMarkerPosition,
    effectivePublishLocation,
  }
}
