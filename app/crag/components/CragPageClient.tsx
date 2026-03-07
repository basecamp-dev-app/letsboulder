
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import PlaceCommunityClient from '@/features/community/components/PlaceCommunityClient'
import { GRADES, normalizeGrade } from '@/lib/grades'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import CragPageSkeleton from '@/app/crag/components/CragPageSkeleton'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OfflineCragMapPin } from '@/components/OfflineCragMapSnippet'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/lib/climb/queries'

import 'leaflet/dist/leaflet.css'

function getAverageCoordinates(images: { latitude: number; longitude: number }[]): [number, number] {
  const totalLat = images.reduce((sum, img) => sum + img.latitude, 0)
  const totalLng = images.reduce((sum, img) => sum + img.longitude, 0)
  return [totalLat / images.length, totalLng / images.length]
}

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
const TopThisPlacePanel = dynamic(() => import('@/features/community/components/TopThisPlacePanel'))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/components/PlaceRankingsPanel'))

interface LeafletIconDefault {
  prototype: {
    _getIconUrl?: () => void
  }
  mergeOptions: (options: Record<string, string>) => void
}

let L: typeof import('leaflet') | null = null
const CRAG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const cragImageCache = new Map<string, CachedCragImageData>()

async function setupLeafletIcons() {
  if (typeof window !== 'undefined') {
    const leaflet = await import('leaflet')
    L = leaflet as unknown as typeof import('leaflet')
    const iconDefault = L!.Icon.Default as unknown as LeafletIconDefault
    delete iconDefault.prototype._getIconUrl
    iconDefault.mergeOptions({
      iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    })
  }
}

export interface Crag {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name?: string | null
  sub_area?: string | null
  latitude: number | null
  longitude: number | null
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  regions?: {
    id: string
    name: string
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}

interface OfflineHydratedCragData {
  images: ImageData[]
  routes: CragRoute[]
  imageCards: OfflineCragImageCard[]
  pins: OfflineCragMapPin[]
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  cragCenter: [number, number] | null
}

interface OfflineCragRouteSummary {
  routeId: string
  climbId: string
  name: string
  grade: string
  routeType: string | null
}

interface OfflineCragImageCard {
  imageId: string
  imageUrl: string
  href: string
  latitude: number | null
  longitude: number | null
  routes: OfflineCragRouteSummary[]
}

interface RouteLineTargetRow {
  id: string
  image_id: string
  climb_id: string
  climbs:
    | { slug: string | null }
    | Array<{ slug: string | null }>
    | null
}

interface ImageRouteTarget {
  climbId: string
  routeId: string
  climbSlug: string | null
}

interface CachedCragImageData {
  crag: Crag | null
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  cachedAt: number
}

interface RawRouteLine {
  images:
    | { face_direction: string | null; face_directions: string[] | null }
    | Array<{ face_direction: string | null; face_directions: string[] | null }>
    | null
}

interface RawClimb {
  id: string
  name: string | null
  grade: string
  slug: string | null
  route_type: string | null
  route_lines: RawRouteLine[] | null
}

interface CragRoute {
  id: string
  name: string
  grade: string
  slug: string | null
  routeType: string | null
  directions: string[]
}

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))
const gradeOrderIndex = new Map(GRADES.map((grade, index) => [grade, index]))
const MIN_FILTER_GRADE = '3A'
const FILTER_GRADES = GRADES.slice(Math.max(0, GRADES.indexOf(MIN_FILTER_GRADE)))

function extractDirections(routeLines: RawRouteLine[] | null | undefined): string[] {
  if (!routeLines || routeLines.length === 0) return []

  const uniqueDirections = new Set<string>()

  for (const routeLine of routeLines) {
    const imageData = routeLine.images
    if (!imageData) continue

    const images = Array.isArray(imageData) ? imageData : [imageData]

    for (const image of images) {
      const multipleDirections = image.face_directions || []
      for (const direction of multipleDirections) {
        if (direction) uniqueDirections.add(direction)
      }

      if (image.face_direction) {
        uniqueDirections.add(image.face_direction)
      }
    }
  }

  return [...uniqueDirections].sort((a, b) => {
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

function formatCragRoutes(climbs: RawClimb[] | null | undefined): CragRoute[] {
  if (!climbs || climbs.length === 0) return []

  return climbs.map((climb) => ({
    id: climb.id,
    name: (climb.name || '').trim() || 'Unnamed route',
    grade: normalizeGrade(climb.grade) || 'Unknown',
    slug: climb.slug,
    routeType: climb.route_type,
    directions: extractDirections(climb.route_lines),
  }))
}

function hydrateOfflineCragData(payloads: ClimbPackResponse[]): OfflineHydratedCragData {
  const imageMap = new Map<string, ImageData>()
  const defaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
  const routeMap = new Map<string, CragRoute>()
  const imageCardMap = new Map<string, OfflineCragImageCard>()
  const pinMap = new Map<string, OfflineCragMapPin>()

  const getOfflineSlug = (canonicalPath: string | undefined, climbId: string) => {
    if (!canonicalPath || canonicalPath === `/climb/${climbId}`) return null
    const parts = canonicalPath.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : null
  }

  for (const payload of payloads) {
    const primaryImage = payload.primary_image
    const climb = payload.climb
    if (!primaryImage || !climb) continue

    const existingImage = imageMap.get(primaryImage.id)
    const primaryRouteCount = Array.isArray(payload.primary_route_lines) ? payload.primary_route_lines.length : 0
    const supplementaryFacesCount = Math.max(0, (payload.faces || []).filter((face) => !face.is_primary).length)

    imageMap.set(primaryImage.id, {
      id: primaryImage.id,
      url: primaryImage.url,
      latitude: existingImage?.latitude ?? primaryImage.latitude ?? null,
      longitude: existingImage?.longitude ?? primaryImage.longitude ?? null,
      route_lines_count: (existingImage?.route_lines_count || 0) + primaryRouteCount,
      is_verified: existingImage?.is_verified || false,
      verification_count: existingImage?.verification_count || 0,
      supplementary_faces_count: Math.max(existingImage?.supplementary_faces_count || 0, supplementaryFacesCount),
    })

    const firstPrimaryRoute = payload.primary_route_lines?.[0]
    if (firstPrimaryRoute && !defaultRouteTargetByImageId[primaryImage.id]) {
      defaultRouteTargetByImageId[primaryImage.id] = {
        climbId: firstPrimaryRoute.climb_id,
        routeId: firstPrimaryRoute.id,
        climbSlug: getOfflineSlug(payload.offline_pack.canonicalPath, climb.id),
      }
    }

    const directions = new Set<string>()
    for (const face of payload.faces || []) {
      for (const direction of face.face_directions || []) {
        if (direction) directions.add(direction)
      }
    }

    routeMap.set(climb.id, {
      id: climb.id,
      name: climb.name || 'Unnamed route',
      grade: normalizeGrade(climb.grade) || 'Unknown',
      slug: getOfflineSlug(payload.offline_pack.canonicalPath, climb.id),
      routeType: climb.route_type,
      directions: Array.from(directions).sort((a, b) => {
        const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
        const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
        if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
        if (aIndex === undefined) return 1
        if (bIndex === undefined) return -1
        return aIndex - bIndex
      }),
    })

    const fallbackRouteSummary: OfflineCragRouteSummary = {
      routeId: payload.primary_route_lines?.[0]?.id || `fallback-route:${climb.id}`,
      climbId: climb.id,
      name: climb.name || 'Unnamed climb',
      grade: normalizeGrade(climb.grade) || 'Unknown',
      routeType: climb.route_type,
    }

    const routeSummaries = (Array.isArray(payload.primary_route_lines) && payload.primary_route_lines.length > 0
      ? payload.primary_route_lines.map((line) => ({
          routeId: line.id,
          climbId: line.climb_id,
          name: line.climb?.name || fallbackRouteSummary.name,
          grade: normalizeGrade(line.climb?.grade || fallbackRouteSummary.grade) || fallbackRouteSummary.grade,
          routeType: line.climb?.route_type || fallbackRouteSummary.routeType,
        }))
      : [fallbackRouteSummary]
    ).sort((a, b) => {
      const gradeCompare = a.grade.localeCompare(b.grade)
      if (gradeCompare !== 0) return gradeCompare
      return a.name.localeCompare(b.name)
    })

    const firstRoute = routeSummaries[0] || fallbackRouteSummary
    const href = `/climb/${firstRoute.climbId}?route=${firstRoute.routeId}`
    const existingCard = imageCardMap.get(primaryImage.id)
    const nextRoutes = new Map<string, OfflineCragRouteSummary>()

    for (const route of existingCard?.routes || []) {
      nextRoutes.set(route.routeId, route)
    }

    for (const route of routeSummaries) {
      nextRoutes.set(route.routeId, route)
    }

    imageCardMap.set(primaryImage.id, {
      imageId: primaryImage.id,
      imageUrl: primaryImage.url,
      href,
      latitude: primaryImage.latitude ?? null,
      longitude: primaryImage.longitude ?? null,
      routes: Array.from(nextRoutes.values()).sort((a, b) => {
        const gradeCompare = a.grade.localeCompare(b.grade)
        if (gradeCompare !== 0) return gradeCompare
        return a.name.localeCompare(b.name)
      }),
    })

    if (typeof primaryImage.latitude === 'number' && typeof primaryImage.longitude === 'number') {
      pinMap.set(primaryImage.id, {
        id: primaryImage.id,
        label: `${routeSummaries.length} route${routeSummaries.length === 1 ? '' : 's'}`,
        latitude: primaryImage.latitude,
        longitude: primaryImage.longitude,
      })
    }
  }

  const pins = Array.from(pinMap.values())
  const cragCenter = pins.length > 0
    ? getAverageCoordinates(pins.map((pin) => ({ latitude: pin.latitude, longitude: pin.longitude })))
    : null

  return {
    images: Array.from(imageMap.values()),
    routes: Array.from(routeMap.values()),
    imageCards: Array.from(imageCardMap.values()).sort((a, b) => a.imageId.localeCompare(b.imageId)),
    pins,
    defaultRouteTargetByImageId,
    cragCenter,
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

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function bearingDegrees(from: [number, number], to: [number, number]) {
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLon = lon2 - lon1
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function haversineMeters(from: [number, number], to: [number, number]) {
  const R = 6371000
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

interface CragPageClientProps {
  id: string
  initialCrag?: Crag | null
  communityPlaceId?: string | null
  communityPlaceSlug?: string | null
  initialSessionPosts?: CommunitySessionPost[]
  initialUpdatePosts?: CommunityUpdatePost[]
}

export default function CragPageClient({
  id,
  initialCrag = null,
  communityPlaceId,
  communityPlaceSlug,
  initialSessionPosts = [],
  initialUpdatePosts = [],
}: CragPageClientProps) {
  const router = useRouter()
  const gradeSystem = useGradeSystem()
  const [crag, setCrag] = useState<Crag | null>(initialCrag)
  const [images, setImages] = useState<ImageData[]>([])
  const [routes, setRoutes] = useState<CragRoute[]>([])
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [routeView, setRouteView] = useState<'images' | 'filters' | 'upcoming' | 'updates' | 'rankings'>('images')
  const [minGrade, setMinGrade] = useState<string>('')
  const [maxGrade, setMaxGrade] = useState<string>('')
  const [selectedDirections, setSelectedDirections] = useState<string[]>([])
  const [cragCenter, setCragCenter] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineDialogLoading, setOfflineDialogLoading] = useState(false)
  const [offlinePreviewLoading, setOfflinePreviewLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlinePreview, setOfflinePreview] = useState<Awaited<ReturnType<typeof getCragOfflinePreview>> | null>(null)
  const [offlineProgress, setOfflineProgress] = useState<OfflineJobProgressEvent | null>(null)
  const [offlineCragImageCards, setOfflineCragImageCards] = useState<OfflineCragImageCard[]>([])
  const [isOfflineCragMode, setIsOfflineCragMode] = useState(false)
  const [highlightedImageId, setHighlightedImageId] = useState<string | null>(null)
  const [defaultRouteTargetByImageId, setDefaultRouteTargetByImageId] = useState<Record<string, ImageRouteTarget>>({})
  const mapRef = useRef<L.Map | null>(null)
  const prefetchedPathsRef = useRef(new Set<string>())

  const imageCardRefs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    setupLeafletIcons()
  }, [])

  const refreshCragOfflinePreview = useCallback(async () => {
    setOfflinePreviewLoading(true)
    try {
      const preview = await getCragOfflinePreview(id)
      setOfflinePreview(preview)
      setOfflineError(null)
    } catch (error) {
      console.error('Failed to load crag offline preview:', error)
      setOfflineError('Offline pack preview is unavailable right now.')
      setOfflinePreview(null)
    } finally {
      setOfflinePreviewLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  useEffect(() => {
    let ignore = false

    async function loadCrag() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      const cached = cragImageCache.get(id)
      if (cached && Date.now() - cached.cachedAt <= CRAG_IMAGE_CACHE_TTL_MS) {
        setCrag(cached.crag)
        setImages(cached.images)
        setCragCenter(cached.cragCenter)
        setDefaultRouteTargetByImageId(cached.defaultRouteTargetByImageId)
        setLoading(false)
      } else {
        setLoading(true)
      }

      setRoutes([])
      setRoutesLoadState('idle')

      if (offlineOnly) {
        const offlinePayloads = await getStoredCragClimbPayloads(id)
        if (offlinePayloads.length > 0) {
          if (ignore) return
          const hydrated = hydrateOfflineCragData(offlinePayloads)
          setImages(hydrated.images)
          setRoutes(hydrated.routes)
          setOfflineCragImageCards(hydrated.imageCards)
          setIsOfflineCragMode(true)
          setRoutesLoadState('loaded')
          setDefaultRouteTargetByImageId(hydrated.defaultRouteTargetByImageId)
          setCrag(initialCrag)
          setCragCenter(hydrated.cragCenter)
          setLoading(false)
          return
        }
      }

      const supabase = createClient()

      const imagesPromise = supabase
        .from('images')
        .select('id, url, latitude, longitude, is_verified, verification_count, route_lines(count)')
        .eq('crag_id', id)
        .order('created_at', { ascending: false })

      const supplementaryImageIdsPromise = supabase
        .from('crag_images')
        .select('linked_image_id, source_image_id, url')
        .eq('crag_id', id)
        .not('linked_image_id', 'is', null)

      const cragPromise = initialCrag
        ? Promise.resolve({ data: initialCrag, error: null as null })
        : supabase
            .from('crags')
            .select(`
              *,
              regions:region_id (id, name)
            `)
            .eq('id', id)
            .single()

      let cragData
      let cragError
      let imagesData
      let imagesError
      let supplementaryImageIdsData
      let supplementaryImageIdsError

      try {
        ;[
          { data: cragData, error: cragError },
          { data: imagesData, error: imagesError },
          { data: supplementaryImageIdsData, error: supplementaryImageIdsError },
        ] = await Promise.all([cragPromise, imagesPromise, supplementaryImageIdsPromise])
      } catch (error) {
        const offlinePayloads = await getStoredCragClimbPayloads(id)
        if (offlinePayloads.length > 0) {
          if (ignore) return
          const hydrated = hydrateOfflineCragData(offlinePayloads)
          setImages(hydrated.images)
          setRoutes(hydrated.routes)
          setOfflineCragImageCards(hydrated.imageCards)
          setIsOfflineCragMode(true)
          setRoutesLoadState('loaded')
          setDefaultRouteTargetByImageId(hydrated.defaultRouteTargetByImageId)
          setCrag(initialCrag)
          setCragCenter(hydrated.cragCenter)
          setLoading(false)
          return
        }

        throw error
      }

      if (cragError || !cragData) {
        if (ignore) return
        console.error('Error fetching crag:', cragError)
        setLoading(false)
        return
      }

      if (imagesError) {
        console.error('Error fetching images:', imagesError)
      }

      if (supplementaryImageIdsError) {
        console.error('Error fetching supplementary image IDs:', supplementaryImageIdsError)
      }

      const supplementaryImageIds = new Set(
        (supplementaryImageIdsData || [])
          .map((row: { linked_image_id: string | null }) => row.linked_image_id)
          .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0)
      )

      const supplementaryImageUrls = new Set(
        (supplementaryImageIdsData || [])
          .filter((row: { source_image_id: string | null; url?: string | null }) => !!row.source_image_id)
          .map((row: { url?: string | null }) => row.url)
          .filter((value: string | null | undefined): value is string => typeof value === 'string' && value.length > 0)
      )

      const supplementaryCountByPrimaryId: Record<string, number> = {}
      for (const row of (supplementaryImageIdsData || []) as Array<{ source_image_id: string | null }>) {
        if (!row.source_image_id) continue
        supplementaryCountByPrimaryId[row.source_image_id] = (supplementaryCountByPrimaryId[row.source_image_id] || 0) + 1
      }

      const primaryImagesData = (imagesData || []).filter(
        (img: { id: string; url: string }) => !supplementaryImageIds.has(img.id) && !supplementaryImageUrls.has(img.url)
      )

      const formattedImages: ImageData[] = primaryImagesData.map((img: {
        id: string
        url: string
        latitude: number | null
        longitude: number | null
        is_verified: boolean | null
        verification_count: number | null
        route_lines: Array<{ count: number }>
      }) => {
        const routeLinesCount = Array.isArray(img.route_lines) && img.route_lines[0]
          ? img.route_lines[0].count
          : 0
        return {
          id: img.id,
          url: resolveRouteImageUrl(img.url),
          latitude: img.latitude,
          longitude: img.longitude,
          is_verified: img.is_verified || false,
          verification_count: img.verification_count || 0,
          route_lines_count: routeLinesCount,
          supplementary_faces_count: supplementaryCountByPrimaryId[img.id] || 0,
        }
      })

      const imageIds = formattedImages.map((image) => image.id)
      const nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}

      if (imageIds.length > 0) {
        const { data: routeTargetsData, error: routeTargetsError } = await supabase
          .from('route_lines')
          .select('id, image_id, climb_id, climbs(slug)')
          .in('image_id', imageIds)
          .order('image_id', { ascending: true })
          .order('sequence_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })

        if (routeTargetsError) {
          console.error('Error fetching image route targets:', routeTargetsError)
        } else {
          for (const row of (routeTargetsData || []) as RouteLineTargetRow[]) {
            if (nextDefaultRouteTargetByImageId[row.image_id]) continue
            const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
            nextDefaultRouteTargetByImageId[row.image_id] = {
              climbId: row.climb_id,
              routeId: row.id,
              climbSlug: climb?.slug || null,
            }
          }
        }
      }

      if (ignore) return

      setIsOfflineCragMode(false)
      setOfflineCragImageCards([])
      setCrag(cragData)
      setImages(formattedImages)
      setDefaultRouteTargetByImageId(nextDefaultRouteTargetByImageId)
      const withCoords = formattedImages.filter(
        (img): img is ImageData & { latitude: number; longitude: number } => img.latitude !== null && img.longitude !== null
      )
      let nextCenter: [number, number] | null = null
      if (withCoords.length > 0) {
        nextCenter = getAverageCoordinates(withCoords)
      } else {
        nextCenter = cragData.latitude && cragData.longitude ? [cragData.latitude, cragData.longitude] : null
      }

      setCragCenter(nextCenter)
      setLoading(false)

      cragImageCache.set(id, {
        crag: cragData,
        images: formattedImages,
        cragCenter: nextCenter,
        defaultRouteTargetByImageId: nextDefaultRouteTargetByImageId,
        cachedAt: Date.now(),
      })
    }

    loadCrag()

    return () => {
      ignore = true
    }
  }, [id, initialCrag])

  useEffect(() => {
    let ignore = false

    async function loadAdminStatus() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || ignore) return

      if (user.app_metadata?.gsyrocks_admin === true) {
        setIsAdmin(true)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (ignore) return
      setIsAdmin(profile?.is_admin === true)
    }

    loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (routeView !== 'filters' || routesLoadState !== 'idle') return

    let ignore = false

    async function loadRoutesForFilters() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      setRoutesLoadState('loading')

      if (offlineOnly) {
        const offlinePayloads = await getStoredCragClimbPayloads(id)
        if (!ignore && offlinePayloads.length > 0) {
          const hydrated = hydrateOfflineCragData(offlinePayloads)
          setRoutes(hydrated.routes)
          setOfflineCragImageCards(hydrated.imageCards)
          setIsOfflineCragMode(true)
          setRoutesLoadState('loaded')
          return
        }
      }

      const supabase = createClient()

      let climbsData
      let climbsError
      try {
        const response = await supabase
          .from('climbs')
          .select(`
            id,
            name,
            grade,
            slug,
            route_type,
            route_lines (
              images (
                face_direction,
                face_directions
              )
            )
          `)
          .eq('crag_id', id)
          .in('status', ['active', 'approved'])
        climbsData = response.data
        climbsError = response.error
      } catch (error) {
        const offlinePayloads = await getStoredCragClimbPayloads(id)
        if (!ignore && offlinePayloads.length > 0) {
          const hydrated = hydrateOfflineCragData(offlinePayloads)
          setRoutes(hydrated.routes)
          setOfflineCragImageCards(hydrated.imageCards)
          setIsOfflineCragMode(true)
          setRoutesLoadState('loaded')
          return
        }
        throw error
      }

      if (ignore) return

      if (climbsError) {
        console.error('Error fetching climbs:', climbsError)
        setRoutesLoadState('error')
        return
      }

      setRoutes(formatCragRoutes((climbsData || []) as unknown as RawClimb[]))
      setRoutesLoadState('loaded')
    }

    loadRoutesForFilters()

    return () => {
      ignore = true
    }
  }, [id, routeView, routesLoadState])

  useEffect(() => {
    if (!mapRef.current || !cragCenter) return

    mapRef.current.setView(cragCenter, 15)
  }, [cragCenter])

  const handleFlagCrag = async (cragId: string) => {
    if (isFlagging) return
    setIsFlagging(true)
    setToast(null)

    try {
      const response = await csrfFetch(`/api/crags/${cragId}/flag`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setToast(data.error || 'Failed to flag crag')
        return
      }

      setToast('Crag flagged for review')
      setTimeout(() => setToast(null), 3000)
    } catch {
      setToast('Failed to flag crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setIsFlagging(false)
    }
  }

  const viewCenter = cragCenter

  const orderedImages = useMemo(() => {
    if (!viewCenter) return images
    const withGeo = images
      .map((img) => {
        if (img.latitude == null || img.longitude == null) return null
        const pos: [number, number] = [img.latitude, img.longitude]
        return {
          img,
          bearing: bearingDegrees(viewCenter, pos),
          dist: haversineMeters(viewCenter, pos),
        }
      })
      .filter(Boolean) as Array<{ img: ImageData; bearing: number; dist: number }>

    withGeo.sort((a, b) => {
      if (a.bearing !== b.bearing) return a.bearing - b.bearing
      return a.dist - b.dist
    })

    const sorted = withGeo.map((x) => x.img)
    const missing = images.filter((img) => img.latitude == null || img.longitude == null)
    return [...sorted, ...missing]
  }, [images, viewCenter])

  const imageIndexById = useMemo(() => {
    const m = new Map<string, number>()
    orderedImages.forEach((img, idx) => m.set(img.id, idx + 1))
    return m
  }, [orderedImages])

  const mappableImages = useMemo(() => {
    return orderedImages.filter(
      (image): image is ImageData & { latitude: number; longitude: number } =>
        image.latitude !== null && image.longitude !== null
    )
  }, [orderedImages])

  const totalRoutes = useMemo(() => {
    return images.reduce((sum, img) => sum + img.route_lines_count, 0)
  }, [images])

  const routeTypeChips = useMemo(() => {
    const uniqueTypes = new Set<string>()
    for (const route of routes) {
      if (!route.routeType) continue
      uniqueTypes.add(normalizeRouteType(route.routeType))
    }
    return [...uniqueTypes].sort((a, b) => a.localeCompare(b))
  }, [routes])

  const routeHrefBase = useMemo(() => {
    if (!crag?.country_code || !crag.slug) return null
    return `/${crag.country_code.toLowerCase()}/${crag.slug}`
  }, [crag?.country_code, crag?.slug])

  const availableDirections = useMemo(() => {
    const seen = new Set<string>()
    for (const route of routes) {
      if (route.directions.length === 0) {
        seen.add('Unknown')
        continue
      }
      for (const direction of route.directions) {
        seen.add(direction)
      }
    }

    return [...seen].sort((a, b) => {
      if (a === 'Unknown' && b !== 'Unknown') return 1
      if (a !== 'Unknown' && b === 'Unknown') return -1
      const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
      const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
      if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
      if (aIndex === undefined) return 1
      if (bIndex === undefined) return -1
      return aIndex - bIndex
    })
  }, [routes])

  const filteredRoutes = useMemo(() => {
    const minIndex = minGrade ? gradeOrderIndex.get(minGrade) : undefined
    const maxIndex = maxGrade ? gradeOrderIndex.get(maxGrade) : undefined

    return routes
      .filter((route) => {
        const routeGradeIndex = gradeOrderIndex.get(route.grade)
        if (minIndex !== undefined) {
          if (routeGradeIndex === undefined || routeGradeIndex < minIndex) return false
        }
        if (maxIndex !== undefined) {
          if (routeGradeIndex === undefined || routeGradeIndex > maxIndex) return false
        }

        if (selectedDirections.length === 0) return true
        const routeDirections = route.directions.length > 0 ? route.directions : ['Unknown']
        return routeDirections.some((direction) => selectedDirections.includes(direction))
      })
      .sort((a, b) => {
        const aGradeIndex = gradeOrderIndex.get(a.grade)
        const bGradeIndex = gradeOrderIndex.get(b.grade)
        if (aGradeIndex === undefined && bGradeIndex === undefined) return a.name.localeCompare(b.name)
        if (aGradeIndex === undefined) return 1
        if (bGradeIndex === undefined) return -1
        if (aGradeIndex !== bGradeIndex) return aGradeIndex - bGradeIndex
        return a.name.localeCompare(b.name)
      })
  }, [maxGrade, minGrade, routes, selectedDirections])

  const scrollToImageCard = useMemo(() => {
    return (imageId: string) => {
      if (typeof document === 'undefined') return
      const el = imageCardRefs.current.get(imageId) || document.getElementById(`crag-image-${imageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedImageId(imageId)
      window.setTimeout(() => setHighlightedImageId((prev) => (prev === imageId ? null : prev)), 1400)
    }
  }, [])

  const getImageDestination = useCallback((imageId: string) => {
    const target = defaultRouteTargetByImageId[imageId]
    if (!target) return `/image/${imageId}`

    const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offlineOnly) {
      const next = new URLSearchParams()
      next.set('route', target.routeId)
      return `/climb/${target.climbId}?${next.toString()}`
    }

    if (target.climbSlug && routeHrefBase) {
      return `${routeHrefBase}/${target.climbSlug}`
    }

    const next = new URLSearchParams()
    next.set('route', target.routeId)
    return `/climb/${target.climbId}?${next.toString()}`
  }, [defaultRouteTargetByImageId, routeHrefBase])

  const prefetchImageDestination = useCallback((imageId: string) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const destination = getImageDestination(imageId)
    if (prefetchedPathsRef.current.has(destination)) return
    prefetchedPathsRef.current.add(destination)
    router.prefetch(destination)
  }, [getImageDestination, router])

  const navigateToImageDestination = useCallback((imageId: string) => {
    const destination = getImageDestination(imageId)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      window.location.assign(destination)
      return
    }
    router.push(destination)
  }, [getImageDestination, router])

  useEffect(() => {
    if (orderedImages.length === 0) return

    const idsToPrefetch = orderedImages.slice(0, 8).map((image) => image.id)
    const runPrefetch = () => {
      idsToPrefetch.forEach((imageId) => prefetchImageDestination(imageId))
    }

    let idleId: number | null = null
    const timeoutId = window.setTimeout(runPrefetch, 700)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(runPrefetch, { timeout: 1200 })
    }

    return () => {
      window.clearTimeout(timeoutId)
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [orderedImages, prefetchImageDestination])

  if (loading) {
    return <CragPageSkeleton />
  }

  if (!crag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Crag not found</div>
      </div>
    )
  }

  const resolvedCommunityPlaceId = communityPlaceId || crag.id
  const cragOfflineLabel = !offlinePreview?.existingPack
    ? 'Download Crag'
    : offlinePreview.isUpToDate
      ? 'Saved Offline'
      : 'Update Offline Pack'
  const canDownloadCrag = !offlineDialogLoading
  const projectedUsage = offlinePreview
    ? offlinePreview.usageBytes - (offlinePreview.existingPack?.estimatedBytes || 0) + (offlinePreview.deltaBytes || 0)
    : 0
  const overOfflineBudget = !!offlinePreview && projectedUsage > offlinePreview.budgetBytes

  const handleOpenOfflineDialog = async () => {
    setOfflineDialogOpen(true)
    void refreshCragOfflinePreview()
  }

  const handleSaveCragOffline = async () => {
    if (!offlinePreview) {
      await refreshCragOfflinePreview()
      return
    }
    setOfflineDialogLoading(true)
    setOfflineProgress(null)

    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false)
      }

      const result = await saveCragOffline(id, (event) => {
        setOfflineProgress(event)
      })
      await result.completed
      await refreshCragOfflinePreview()
      setToast(offlinePreview.existingPack ? 'Offline crag pack updated' : 'Crag saved for offline use')
      setTimeout(() => setToast(null), 2500)
    } catch (error) {
      console.error('Failed to save crag offline pack:', error)
      setToast(error instanceof Error ? error.message : 'Failed to save crag offline pack')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }

  const handleRemoveCragOffline = async () => {
    setOfflineDialogLoading(true)
    try {
      await removeCragOffline(id)
      await refreshCragOfflinePreview()
      setOfflineDialogOpen(false)
      setToast('Offline crag pack removed')
      setTimeout(() => setToast(null), 2500)
    } catch (error) {
      console.error('Failed to remove crag pack:', error)
      setToast('Failed to remove offline crag pack')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      <div className="relative h-[26vh] md:h-[50vh] bg-gray-200 dark:bg-gray-800">
        <MapContainer
          ref={mapRef as React.RefObject<L.Map | null>}
          center={cragCenter || [crag.latitude || 0, crag.longitude || 0]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={true}
          whenReady={() => setMapReady(true)}
        >
          {mapReady && (
            <>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='Tiles © Esri'
                maxZoom={19}
              />

          {mappableImages.map((image) => (
            <Marker
              key={image.id}
              position={[image.latitude, image.longitude]}
              icon={L?.divIcon({
                className: 'image-marker',
                html: `<div style="
                  background: ${image.is_verified ? '#22c55e' : '#eab308'};
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 11px;
                  font-weight: bold;
                  border: 2px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">${imageIndexById.get(image.id) ?? ''}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.stopPropagation()
                  scrollToImageCard(image.id)
                },
              }}
            >
              <Popup
                closeButton={false}
                className="image-popup"
              >
                <div
                  className="w-40 cursor-pointer pt-1"
                  onMouseEnter={() => prefetchImageDestination(image.id)}
                  onTouchStart={() => prefetchImageDestination(image.id)}
                  onClick={() => {
                    navigateToImageDestination(image.id)
                  }}
                >
                  <p className="font-semibold text-sm text-gray-900">
                    Image {imageIndexById.get(image.id) ?? ''}
                  </p>
                  <p className="text-xs text-gray-600">
                    {image.route_lines_count} route{image.route_lines_count !== 1 ? 's' : ''}
                  </p>
                  {image.supplementary_faces_count > 0 ? (
                    <p className="text-xs text-gray-600">
                      {1 + image.supplementary_faces_count} faces
                    </p>
                  ) : null}
                  <p className={`text-xs ${image.is_verified ? 'text-green-600' : 'text-yellow-600'}`}>
                    {image.is_verified ? '✓ Verified' : `○ ${image.verification_count}/3 verified`}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
          </>
          )}
        </MapContainer>

        <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-md backdrop-blur">
          {crag.name}
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] max-w-[calc(100%-2rem)] rounded-xl border border-white/60 bg-white/92 px-3 py-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/92">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleOpenOfflineDialog} disabled={!canDownloadCrag} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
              {offlineDialogLoading || offlinePreviewLoading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {cragOfflineLabel}
            </Button>
            {offlinePreview && (
              <span className="text-xs text-gray-600 dark:text-gray-300">
                {offlinePreview.changedClimbs > 0 && offlinePreview.existingPack
                  ? `${offlinePreview.changedClimbs} climbs changed · ${formatBytes(offlinePreview.deltaBytes)} delta`
                  : `${offlinePreview.manifest.climbCount} climbs · ${formatBytes(offlinePreview.totalBytes)}`}
              </span>
            )}
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => handleFlagCrag(crag.id)}
            disabled={isFlagging}
            className="absolute top-4 right-4 z-[1000] px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isFlagging ? 'Flagging...' : '🚩 Flag'}
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="sticky top-[calc(var(--app-header-offset)+0.25rem)] z-[1200] mb-5 border-b border-gray-200 bg-gray-50/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <nav className="flex flex-wrap gap-x-1 -mb-px">
            <button
              type="button"
              onClick={() => setRouteView('images')}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                routeView === 'images'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Images
            </button>
            <button
              type="button"
              onClick={() => setRouteView('filters')}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                routeView === 'filters'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Filter routes
            </button>
            <button
              type="button"
              onClick={() => setRouteView('upcoming')}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                routeView === 'upcoming'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Session planner
            </button>
            <button
              type="button"
              onClick={() => setRouteView('updates')}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                routeView === 'updates'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Updates
            </button>
            <button
              type="button"
              onClick={() => setRouteView('rankings')}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                routeView === 'rankings'
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              Rankings
            </button>
          </nav>
        </div>

        {routeView === 'images' && (
          <>
            <div>
              {isOfflineCragMode ? (
                offlineCragImageCards.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No saved topo images found in this crag pack.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {offlineCragImageCards.map((imageCard) => (
                        <Link
                          key={imageCard.imageId}
                          href={imageCard.href}
                          id={`offline-image-card-${imageCard.imageId}`}
                          className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 ${
                            highlightedImageId === imageCard.imageId ? 'ring-2 ring-blue-400' : ''
                          }`}
                          onClick={() => setHighlightedImageId(imageCard.imageId)}
                        >
                          <div className="relative aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                            <Image
                              src={imageCard.imageUrl}
                              alt={`${crag.name} topo image`}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 100vw, 33vw"
                              unoptimized
                            />
                            <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-gray-900 shadow-sm">
                              {imageCard.routes.length} route{imageCard.routes.length === 1 ? '' : 's'}
                            </div>
                            {typeof imageCard.latitude === 'number' && typeof imageCard.longitude === 'number' ? (
                              <div className="absolute right-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                                Pin
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-2 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Topo image</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {imageCard.routes.slice(0, 4).map((route) => (
                                <span key={`${imageCard.imageId}-${route.routeId}`} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                  {route.name} {formatGradeForDisplay(route.grade, gradeSystem)}
                                </span>
                              ))}
                              {imageCard.routes.length > 4 ? (
                                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                                  +{imageCard.routes.length - 4} more
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Open one topo image with all saved route lines available offline.</p>
                          </div>
                        </Link>
                      ))}
                  </div>
                )
              ) : orderedImages.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No route images yet</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {orderedImages.map((image) => (
                    <div
                      key={image.id}
                      id={`crag-image-${image.id}`}
                      ref={(el) => {
                        if (!el) return
                        imageCardRefs.current.set(image.id, el)
                      }}
                      className={`block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer ring-2 ring-transparent ${
                        highlightedImageId === image.id ? 'ring-blue-400' : ''
                      }`}
                      onMouseEnter={() => prefetchImageDestination(image.id)}
                      onTouchStart={() => prefetchImageDestination(image.id)}
                      onClick={() => {
                        navigateToImageDestination(image.id)
                      }}
                    >
                      <div className="relative h-32 bg-gray-200 dark:bg-gray-700">
                        <Image
                          src={image.url}
                          alt={`${crag.name} topo image ${imageIndexById.get(image.id) ?? ''}`.trim()}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 33vw, 25vw"
                        />
                        {image.supplementary_faces_count > 0 && (
                          <div className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                            {1 + image.supplementary_faces_count} faces
                          </div>
                        )}
                        <div className="absolute top-2 left-2 bg-white/90 text-gray-900 text-xs px-2 py-1 rounded-full font-semibold shadow-sm">
                          {imageIndexById.get(image.id) ?? ''}
                        </div>
                        <div className="absolute bottom-2 right-2 bg-gray-900/80 text-white text-xs px-2 py-1 rounded-full">
                          {image.route_lines_count} routes
                        </div>
                        <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                          image.is_verified
                            ? 'bg-green-500 text-white'
                            : 'bg-yellow-500 text-white'
                        }`}>
                          {image.is_verified ? '✓' : `${image.verification_count}/3`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-6 mb-6">
              {routeTypeChips.length > 0
                ? routeTypeChips.map((routeType) => (
                    <span key={routeType} className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                      {formatRouteTypeLabel(routeType)}
                    </span>
                  ))
                : crag.type && (
                    <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                      {formatRouteTypeLabel(crag.type)}
                    </span>
                  )}
              {crag.rock_type && (
                <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 capitalize">
                  {crag.rock_type}
                </span>
              )}
              {crag.region_name && (
                <span className="px-3 py-1 rounded-full text-sm bg-blue-600 text-white border border-blue-600">
                  Region: {crag.region_name}
                </span>
              )}
              {crag.sub_area && (
                <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                  Sub-area: {crag.sub_area}
                </span>
              )}
              <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 tabular-nums">
                {isOfflineCragMode
                  ? `${offlineCragImageCards.length} topo image${offlineCragImageCards.length === 1 ? '' : 's'}`
                  : `${totalRoutes} routes`}
              </span>
            </div>

          </>
        )}

        {routeView === 'filters' && (
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Min grade</span>
                  <select
                    value={minGrade}
                    onChange={(event) => {
                      const value = event.target.value
                      setMinGrade(value)
                      if (value && maxGrade) {
                        const nextMin = gradeOrderIndex.get(value)
                        const nextMax = gradeOrderIndex.get(maxGrade)
                        if (nextMin !== undefined && nextMax !== undefined && nextMin > nextMax) {
                          setMaxGrade(value)
                        }
                      }
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any</option>
                    {FILTER_GRADES.map((grade) => (
                      <option key={`min-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Max grade</span>
                  <select
                    value={maxGrade}
                    onChange={(event) => {
                      const value = event.target.value
                      setMaxGrade(value)
                      if (value && minGrade) {
                        const nextMax = gradeOrderIndex.get(value)
                        const nextMin = gradeOrderIndex.get(minGrade)
                        if (nextMax !== undefined && nextMin !== undefined && nextMax < nextMin) {
                          setMinGrade(value)
                        }
                      }
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">Any</option>
                    {FILTER_GRADES.map((grade) => (
                      <option key={`max-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMinGrade('')
                      setMaxGrade('')
                      setSelectedDirections([])
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Clear filters
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Face direction</p>
                <div className="flex flex-wrap gap-2">
                  {availableDirections.length === 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">No face direction data yet.</span>
                  )}
                  {availableDirections.map((direction) => {
                    const selected = selectedDirections.includes(direction)
                    return (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => {
                          setSelectedDirections((prev) => {
                            if (prev.includes(direction)) {
                              return prev.filter((item) => item !== direction)
                            }
                            return [...prev, direction]
                          })
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {direction}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold tabular-nums">{filteredRoutes.length}</span> route{filteredRoutes.length === 1 ? '' : 's'} match your filters
              </p>
            </div>

            {routesLoadState === 'loading' ? (
              <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Loading route filters...</p>
            ) : routesLoadState === 'error' ? (
              <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">Route filters are unavailable right now.</p>
            ) : filteredRoutes.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">No routes match this filter combination.</p>
            ) : (
              <>
                <table className="hidden w-full md:table">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Route</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Grade</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Face</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoutes.map((route) => (
                      <tr key={route.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/70">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {route.slug && routeHrefBase ? (
                            <Link href={`${routeHrefBase}/${route.slug}`} className="font-medium text-gray-900 hover:underline dark:text-gray-100">
                              {route.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{route.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-gray-700 dark:text-gray-300">{formatGradeForDisplay(route.grade, gradeSystem)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{route.directions.length > 0 ? route.directions.join(', ') : 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-2 p-3 md:hidden">
                  {filteredRoutes.map((route) => (
                    <div key={route.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex items-baseline justify-between gap-3">
                        {route.slug && routeHrefBase ? (
                          <Link href={`${routeHrefBase}/${route.slug}`} className="text-sm font-semibold text-gray-900 hover:underline dark:text-gray-100">
                            {route.name}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{route.name}</p>
                        )}
                        <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{formatGradeForDisplay(route.grade, gradeSystem)}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Faces: {route.directions.length > 0 ? route.directions.join(', ') : 'Unknown'}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {routeView === 'upcoming' && (
          <div className="mb-6 space-y-4">
            <PlaceCommunityClient
              activeTab="upcoming"
              placeId={resolvedCommunityPlaceId}
              sessionPosts={initialSessionPosts}
              updatePosts={initialUpdatePosts}
            />
          </div>
        )}

        {routeView === 'updates' && (
          <div className="mb-6 space-y-4">
            <PlaceCommunityClient
              activeTab="updates"
              placeId={resolvedCommunityPlaceId}
              sessionPosts={initialSessionPosts}
              updatePosts={initialUpdatePosts}
            />
          </div>
        )}

        {routeView === 'rankings' && (
          <div className="mb-6 space-y-4">
            {communityPlaceSlug ? (
              <>
                <TopThisPlacePanel slug={communityPlaceSlug} />
                <PlaceRankingsPanel slug={communityPlaceSlug} />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                Rankings are not available for this crag yet.
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={offlineDialogOpen} onOpenChange={setOfflineDialogOpen}>
        <DialogContent className="border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>{offlinePreview?.existingPack ? 'Update offline crag pack' : 'Download crag offline'}</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Save this crag and its climb topos for offline viewing. Individually saved climbs stay pinned if you remove the crag pack later.
            </DialogDescription>
          </DialogHeader>

          {offlinePreviewLoading && !offlinePreview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
              Preparing offline pack details...
            </div>
          )}

          {offlinePreview && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/70">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Climbs</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.manifest.climbCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Changed climbs</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.changedClimbs}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Total size</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.totalBytes)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Cached tiles</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.tileCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Delta size</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.deltaBytes)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Storage used</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.usageBytes)} of {formatBytes(offlinePreview.budgetBytes)}</span>
                </div>
              </div>

              {offlinePreview.warning && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  {offlinePreview.warning}
                </p>
              )}

              {offlineProgress && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <p className="font-medium">{offlineProgress.completedClimbs} / {offlineProgress.totalClimbs} climbs synced</p>
                  <p className="mt-1 text-sm">{formatBytes(offlineProgress.completedBytes)} / {formatBytes(offlineProgress.totalBytes)} cached</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{offlineProgress.phase}{offlineProgress.currentClimbName ? ` · ${offlineProgress.currentClimbName}` : ''}{offlinePreview.tileCount > 0 ? ` · ${offlinePreview.tileCount} tiles` : ''}</p>
                </div>
              )}

              {offlinePreview.isUpToDate && !offlineProgress && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  This crag pack is already up to date.
                </p>
              )}

              {overOfflineBudget && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  This update would exceed your 250 MB offline storage budget. Remove another pack first.
                </p>
              )}

              {offlineError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                  {offlineError}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {offlinePreview?.existingPack && (
              <Button variant="ghost" onClick={handleRemoveCragOffline} disabled={offlineDialogLoading} className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                {offlineDialogLoading ? 'Removing...' : 'Remove offline pack'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOfflineDialogOpen(false)} disabled={offlineDialogLoading}>Close</Button>
            {offlineError && !offlinePreview && (
              <Button variant="outline" onClick={() => void refreshCragOfflinePreview()} disabled={offlinePreviewLoading || offlineDialogLoading}>
                {offlinePreviewLoading ? 'Retrying...' : 'Retry'}
              </Button>
            )}
            <Button onClick={handleSaveCragOffline} disabled={offlineDialogLoading || offlinePreviewLoading || !offlinePreview || overOfflineBudget || offlinePreview.isUpToDate}>
              {offlineDialogLoading ? 'Syncing...' : offlinePreview?.existingPack ? 'Update offline pack' : 'Download crag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
