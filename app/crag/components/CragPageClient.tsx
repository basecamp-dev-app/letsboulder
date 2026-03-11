
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Download, Filter, Loader2, Search, ArrowUpDown, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import PlaceCommunityClient from '@/features/community/components/PlaceCommunityClient'
import { GRADES, PUBLIC_GRADES, normalizeGrade } from '@/lib/grades'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import CragPageSkeleton from '@/app/crag/components/CragPageSkeleton'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OfflineCragMapPin } from '@/components/OfflineCragMapSnippet'
import { buildCragImageDestination, type ImageRouteTarget } from '@/app/crag/components/crag-image-destination'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import { Input } from '@/components/ui/input'
import type { Database } from '@/types/database'

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

interface CachedCragImageData {
  crag: Crag | null
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  cachedAt: number
}

type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

export interface CragRoute {
  id: string
  name: string
  grade: string
  slug: string | null
  routeType: string | null
  directions: string[]
  hasTopo: boolean
  topoImageCount: number
  ratingAvg: number | null
  ratingCount: number
  weightedRating: number | null
  sendCount: number
  recentSendCount60d: number
}

export interface RoutePreview {
  imageId: string
  imageUrl: string
}

interface CragSwitcherOption {
  id: string
  name: string
  regionName: string | null
  subArea: string | null
  countryCode: string | null
}

function isOfflineDocumentNavigationPreferred() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))
const gradeOrderIndex = new Map(GRADES.map((grade, index) => [grade, index]))
const FILTER_GRADES = PUBLIC_GRADES

function sortDirections(directions: string[]) {
  return [...new Set(directions.filter(Boolean))].sort((a, b) => {
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

function formatCragRoutes(rows: CragRouteIntelligenceRow[] | null | undefined): CragRoute[] {
  if (!rows || rows.length === 0) return []

  return rows.map((route) => ({
    id: route.id,
    name: (route.name || '').trim() || 'Unnamed route',
    grade: normalizeGrade(route.grade) || 'Unknown',
    slug: route.slug,
    routeType: route.route_type,
    directions: sortDirections(route.directions || []),
    hasTopo: Boolean(route.has_topo),
    topoImageCount: typeof route.topo_image_count === 'number' ? route.topo_image_count : 0,
    ratingAvg: typeof route.rating_avg === 'number' ? route.rating_avg : null,
    ratingCount: typeof route.rating_count === 'number' ? route.rating_count : 0,
    weightedRating: typeof route.weighted_rating === 'number' ? route.weighted_rating : null,
    sendCount: typeof route.send_count === 'number' ? route.send_count : 0,
    recentSendCount60d: typeof route.recent_send_count_60d === 'number' ? route.recent_send_count_60d : 0,
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
        imageId: primaryImage.id,
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
      directions: sortDirections(Array.from(directions)),
      hasTopo: true,
      topoImageCount: 1,
      ratingAvg: null,
      ratingCount: 0,
      weightedRating: null,
      sendCount: 0,
      recentSendCount60d: 0,
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
    const next = new URLSearchParams()
    next.set('image', primaryImage.id)
    const href = `/climb/${firstRoute.climbId}?${next.toString()}`
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

function getGradeIndex(grade: string) {
  return gradeOrderIndex.get(grade)
}

function compareGrades(a: string, b: string) {
  const aIndex = getGradeIndex(a)
  const bIndex = getGradeIndex(b)
  if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
  if (aIndex === undefined) return 1
  if (bIndex === undefined) return -1
  return aIndex - bIndex
}

function formatRatingValue(value: number | null) {
  return value === null ? 'Unrated' : value.toFixed(1)
}

async function getStoredCragClimbPayloadsSafely(cragId: string): Promise<ClimbPackResponse[]> {
  try {
    return await Promise.race([
      getStoredCragClimbPayloads(cragId),
      new Promise<ClimbPackResponse[]>((resolve) => {
        setTimeout(() => resolve([]), 1500)
      }),
    ])
  } catch (error) {
    console.warn('Failed to read stored crag climb payloads:', { cragId, error })
    return []
  }
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
  initialRoutes?: CragRoute[] | null
  initialRoutePreviewByClimbId?: Record<string, RoutePreview>
  initialCragCenter?: [number, number] | null
  communityPlaceId?: string | null
  communityPlaceSlug?: string | null
  initialSessionPosts?: CommunitySessionPost[]
  initialUpdatePosts?: CommunityUpdatePost[]
}

export default function CragPageClient({
  id,
  initialCrag = null,
  initialRoutes = null,
  initialRoutePreviewByClimbId = {},
  initialCragCenter = null,
  communityPlaceId,
  communityPlaceSlug,
  initialSessionPosts = [],
  initialUpdatePosts = [],
}: CragPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const gradeSystem = useGradeSystem()
  const [crag, setCrag] = useState<Crag | null>(initialCrag)
  const hasInitialRouteData = initialRoutes !== null
  const [images, setImages] = useState<ImageData[]>([])
  const [routes, setRoutes] = useState<CragRoute[]>(initialRoutes || [])
  const [routePreviewByClimbId, setRoutePreviewByClimbId] = useState<Record<string, RoutePreview>>(initialRoutePreviewByClimbId)
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(hasInitialRouteData ? 'loaded' : 'idle')
  const [routeSort, setRouteSort] = useState<'sends' | 'rating' | 'grade' | 'name'>('sends')
  const [minGrade, setMinGrade] = useState<string>('')
  const [maxGrade, setMaxGrade] = useState<string>('')
  const [minRating, setMinRating] = useState<string>('')
  const [minSends, setMinSends] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDirections, setSelectedDirections] = useState<string[]>([])
  const [selectedRouteTypes, setSelectedRouteTypes] = useState<string[]>([])
  const [topoOnly, setTopoOnly] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [sortModalOpen, setSortModalOpen] = useState(false)
  const [cragSwitcherOpen, setCragSwitcherOpen] = useState(false)
  const [cragSwitcherQuery, setCragSwitcherQuery] = useState('')
  const [cragSwitcherOptions, setCragSwitcherOptions] = useState<CragSwitcherOption[]>([])
  const [cragCenter, setCragCenter] = useState<[number, number] | null>(initialCragCenter)
  const [loading, setLoading] = useState(!initialCrag)
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

    async function loadCragSwitcherOptions() {
      if (!initialCrag) return
      const sourceCrag = initialCrag
      const fallbackOption: CragSwitcherOption = {
        id: sourceCrag.id,
        name: sourceCrag.name,
        regionName: sourceCrag.region_name || sourceCrag.regions?.name || null,
        subArea: sourceCrag.sub_area || null,
        countryCode: sourceCrag.country_code || null,
      }

      if (cragSwitcherQuery.trim().length >= 2) {
        try {
          const response = await fetch(`/api/crags/search?q=${encodeURIComponent(cragSwitcherQuery.trim())}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (typeof sourceCrag.latitude === 'number' && typeof sourceCrag.longitude === 'number') {
        try {
          const response = await fetch(`/api/crags/nearby?lat=${sourceCrag.latitude}&lng=${sourceCrag.longitude}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (!ignore) {
        setCragSwitcherOptions([fallbackOption])
      }
    }

    void loadCragSwitcherOptions()

    return () => {
      ignore = true
    }
  }, [cragSwitcherQuery, initialCrag?.country_code, initialCrag?.id, initialCrag?.latitude, initialCrag?.longitude, initialCrag?.name, initialCrag?.region_name, initialCrag?.regions?.name, initialCrag?.sub_area])

  useEffect(() => {
    let ignore = false

    async function loadCrag() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      const offlinePayloads = await getStoredCragClimbPayloadsSafely(id)
      const applyOfflineHydratedState = () => {
        if (ignore || offlinePayloads.length === 0) return false
        const hydrated = hydrateOfflineCragData(offlinePayloads)
        setImages(hydrated.images)
        setRoutes(hydrated.routes)
        setOfflineCragImageCards(hydrated.imageCards)
        setIsOfflineCragMode(true)
        setRoutesLoadState('loaded')
        const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
        for (const imageCard of hydrated.imageCards) {
          for (const route of imageCard.routes) {
            if (!nextRoutePreviewByClimbId[route.climbId]) {
              nextRoutePreviewByClimbId[route.climbId] = {
                imageId: imageCard.imageId,
                imageUrl: imageCard.imageUrl,
              }
            }
          }
        }
        setRoutePreviewByClimbId(nextRoutePreviewByClimbId)
        setDefaultRouteTargetByImageId(hydrated.defaultRouteTargetByImageId)
        setCrag(initialCrag)
        setCragCenter(hydrated.cragCenter)
        setLoading(false)
        return true
      }

      setImages([])
      if (!hasInitialRouteData) {
        setRoutes([])
      }
      setOfflineCragImageCards([])
      setIsOfflineCragMode(false)
      setDefaultRouteTargetByImageId({})
      if (!hasInitialRouteData) {
        setRoutePreviewByClimbId({})
      }
      setHighlightedImageId(null)
      if (!initialCragCenter) {
        setCragCenter(null)
      }

      const cached = cragImageCache.get(id)
      if (cached && Date.now() - cached.cachedAt <= CRAG_IMAGE_CACHE_TTL_MS) {
        setCrag(cached.crag)
        setImages(cached.images)
        setCragCenter(cached.cragCenter)
        setDefaultRouteTargetByImageId(cached.defaultRouteTargetByImageId)
        setRoutePreviewByClimbId({})
        setLoading(false)
      } else {
        setLoading(true)
      }

      if (!hasInitialRouteData) {
        setRoutesLoadState('idle')
      }

      if (offlineOnly && applyOfflineHydratedState()) {
        return
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
        if (applyOfflineHydratedState()) {
          return
        }

        throw error
      }

      if (cragError || !cragData) {
        if (applyOfflineHydratedState()) return
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

      if ((imagesError || supplementaryImageIdsError || primaryImagesData.length === 0) && applyOfflineHydratedState()) {
        return
      }

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
      const imageById = new Map(formattedImages.map((image) => [image.id, image]))
      const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}

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
              imageId: row.image_id,
            }
          }

          for (const row of (routeTargetsData || []) as RouteLineTargetRow[]) {
            if (nextRoutePreviewByClimbId[row.climb_id]) continue
            const image = imageById.get(row.image_id)
            if (!image) continue
            nextRoutePreviewByClimbId[row.climb_id] = {
              imageId: row.image_id,
              imageUrl: image.url,
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
      setRoutePreviewByClimbId(nextRoutePreviewByClimbId)
      const withCoords = formattedImages.filter(
        (img): img is ImageData & { latitude: number; longitude: number } => img.latitude !== null && img.longitude !== null
      )
      let nextCenter: [number, number] | null = null
      if (typeof cragData.latitude === 'number' && typeof cragData.longitude === 'number') {
        nextCenter = [cragData.latitude, cragData.longitude]
      } else if (withCoords.length > 0) {
        nextCenter = getAverageCoordinates(withCoords)
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
  }, [hasInitialRouteData, id, initialCrag, initialCragCenter])

  useEffect(() => {
    let ignore = false

    async function loadAdminStatus() {
      if (isOfflineDocumentNavigationPreferred()) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || ignore) return

      if (user.app_metadata?.gsyrocks_admin === true) {
        setIsAdmin(true)
        return
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (ignore) return
        setIsAdmin(profile?.is_admin === true)
      } catch {
        if (ignore) return
        setIsAdmin(false)
      }
    }

    void loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (routesLoadState !== 'idle') return

    let ignore = false

    async function loadRoutesForFilters() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      const offlinePayloadsPromise = getStoredCragClimbPayloadsSafely(id)
      const applyOfflineRoutes = (offlinePayloads: ClimbPackResponse[]) => {
        if (ignore || offlinePayloads.length === 0) return false
        const hydrated = hydrateOfflineCragData(offlinePayloads)
        setRoutes(hydrated.routes)
        setOfflineCragImageCards(hydrated.imageCards)
        setIsOfflineCragMode(true)
        setRoutesLoadState('loaded')
        return true
      }

      setRoutesLoadState('loading')

      if (offlineOnly) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
        if (!ignore) {
          setRoutesLoadState('error')
        }
        return
      }

      const supabase = createClient()

      let routeMetricsData
      let routeMetricsError
      try {
        const response = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: id })
        routeMetricsData = response.data
        routeMetricsError = response.error
      } catch (error) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
        throw error
      }

      if (ignore) return

      if (routeMetricsError) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) return
        console.error('Error fetching crag route intelligence:', routeMetricsError)
        setRoutesLoadState('error')
        return
      }

      if (!routeMetricsData || routeMetricsData.length === 0) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
      }

      setRoutes(formatCragRoutes(routeMetricsData as CragRouteIntelligenceRow[] | null | undefined))
      setRoutesLoadState('loaded')
    }

    loadRoutesForFilters()

    return () => {
      ignore = true
    }
  }, [id, routesLoadState])

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
    const minIndex = minGrade ? getGradeIndex(minGrade) : undefined
    const maxIndex = maxGrade ? getGradeIndex(maxGrade) : undefined
    const normalizedSearchQuery = searchQuery.trim().toLowerCase()
    const minimumRating = minRating ? Number(minRating) : null
    const minimumSends = minSends ? Number(minSends) : null

    return routes
      .filter((route) => {
        const routeGradeIndex = getGradeIndex(route.grade)
        if (minIndex !== undefined) {
          if (routeGradeIndex === undefined || routeGradeIndex < minIndex) return false
        }
        if (maxIndex !== undefined) {
          if (routeGradeIndex === undefined || routeGradeIndex > maxIndex) return false
        }

        if (selectedDirections.length > 0) {
          const routeDirections = route.directions.length > 0 ? route.directions : ['Unknown']
          if (!routeDirections.some((direction) => selectedDirections.includes(direction))) return false
        }

        if (selectedRouteTypes.length > 0) {
          const normalizedRouteType = route.routeType ? normalizeRouteType(route.routeType) : ''
          if (!normalizedRouteType || !selectedRouteTypes.includes(normalizedRouteType)) return false
        }

        if (topoOnly && !route.hasTopo) return false
        if (minimumRating !== null && (route.weightedRating === null || route.weightedRating < minimumRating)) return false
        if (minimumSends !== null && route.sendCount < minimumSends) return false

        if (normalizedSearchQuery.length > 0) {
          const searchable = `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase()
          if (!searchable.includes(normalizedSearchQuery)) return false
        }

        return true
      })
      .sort((a, b) => {
        if (routeSort === 'sends') {
          if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
          if ((a.weightedRating ?? -1) !== (b.weightedRating ?? -1)) return (b.weightedRating ?? -1) - (a.weightedRating ?? -1)
          const gradeCompare = compareGrades(a.grade, b.grade)
          if (gradeCompare !== 0) return gradeCompare
          return a.name.localeCompare(b.name)
        }

        if (routeSort === 'rating') {
          if (a.weightedRating === null && b.weightedRating !== null) return 1
          if (a.weightedRating !== null && b.weightedRating === null) return -1
          if (a.weightedRating !== null && b.weightedRating !== null && a.weightedRating !== b.weightedRating) {
            return b.weightedRating - a.weightedRating
          }
          if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount
          if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
          return a.name.localeCompare(b.name)
        }

        if (routeSort === 'name') {
          return a.name.localeCompare(b.name)
        }

        const gradeCompare = compareGrades(a.grade, b.grade)
        if (gradeCompare !== 0) return gradeCompare
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        return a.name.localeCompare(b.name)
      })
  }, [maxGrade, minGrade, minRating, minSends, routeSort, routes, searchQuery, selectedDirections, selectedRouteTypes, topoOnly])

  const routeStats = useMemo(() => {
    const gradeCounts = new Map<string, number>()
    const sendsByGradeMap = new Map<string, number>()
    const routeTypeCounts = new Map<string, number>()
    let totalSendsAcrossRoutes = 0
    let ratingsWeightedTotal = 0
    let ratingsCountTotal = 0

    for (const route of routes) {
      gradeCounts.set(route.grade, (gradeCounts.get(route.grade) || 0) + 1)
      sendsByGradeMap.set(route.grade, (sendsByGradeMap.get(route.grade) || 0) + route.sendCount)
      totalSendsAcrossRoutes += route.sendCount

      if (route.routeType) {
        const normalizedRouteType = normalizeRouteType(route.routeType)
        routeTypeCounts.set(normalizedRouteType, (routeTypeCounts.get(normalizedRouteType) || 0) + 1)
      }

      if (route.ratingAvg !== null && route.ratingCount > 0) {
        ratingsWeightedTotal += route.ratingAvg * route.ratingCount
        ratingsCountTotal += route.ratingCount
      }
    }

    const gradeDistribution = Array.from(gradeCounts.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => compareGrades(a.grade, b.grade))

    const sendsByGrade = Array.from(sendsByGradeMap.entries())
      .map(([grade, sends]) => ({ grade, sends }))
      .sort((a, b) => compareGrades(a.grade, b.grade))

    const sortedByGrade = [...routes].sort((a, b) => compareGrades(a.grade, b.grade))
    const medianRoute = sortedByGrade.length > 0 ? sortedByGrade[Math.floor((sortedByGrade.length - 1) / 2)] : null
    const mostCommonGrade = gradeDistribution.reduce<{ grade: string; count: number } | null>((best, current) => {
      if (!best || current.count > best.count) return current
      return best
    }, null)

    const routeTypeMix = Array.from(routeTypeCounts.entries())
      .map(([routeType, count]) => ({ routeType, count }))
      .sort((a, b) => b.count - a.count || a.routeType.localeCompare(b.routeType))

    return {
      totalRoutes: routes.length,
      totalSendsAcrossRoutes,
      averageRating: ratingsCountTotal > 0 ? ratingsWeightedTotal / ratingsCountTotal : null,
      mostCommonGrade,
      medianGrade: medianRoute?.grade || null,
      routeTypeMix,
      gradeDistribution,
      sendsByGrade,
      topoCoverageCount: routes.filter((route) => route.hasTopo).length,
      ratedRoutesCount: routes.filter((route) => route.ratingCount > 0).length,
    }
  }, [routes])

  const routeInsightsState = routesLoadState

  const routeInsightsUnavailable = routeInsightsState === 'error'
  const routeLocationLabel = crag?.sub_area || crag?.region_name || crag?.regions?.name || 'Area details pending'

  const searchModalResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return [] as CragRoute[]
    return routes
      .filter((route) => `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase().includes(query))
      .slice(0, 12)
  }, [routes, searchQuery])

  const activeRouteFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

    if (minGrade) {
      chips.push({
        key: 'min-grade',
        label: `Min ${formatGradeForDisplay(minGrade, gradeSystem)}`,
        onRemove: () => setMinGrade(''),
      })
    }

    if (maxGrade) {
      chips.push({
        key: 'max-grade',
        label: `Max ${formatGradeForDisplay(maxGrade, gradeSystem)}`,
        onRemove: () => setMaxGrade(''),
      })
    }

    if (minRating) {
      chips.push({
        key: 'min-rating',
        label: `${minRating}+ stars`,
        onRemove: () => setMinRating(''),
      })
    }

    if (minSends) {
      chips.push({
        key: 'min-sends',
        label: `${minSends}+ sends`,
        onRemove: () => setMinSends(''),
      })
    }

    if (searchQuery.trim()) {
      chips.push({
        key: 'search',
        label: `Search: ${searchQuery.trim()}`,
        onRemove: () => setSearchQuery(''),
      })
    }

    if (topoOnly) {
      chips.push({
        key: 'topo-only',
        label: 'Topo only',
        onRemove: () => setTopoOnly(false),
      })
    }

    for (const direction of selectedDirections) {
      chips.push({
        key: `direction-${direction}`,
        label: `Face ${direction}`,
        onRemove: () => setSelectedDirections((prev) => prev.filter((item) => item !== direction)),
      })
    }

    for (const routeType of selectedRouteTypes) {
      chips.push({
        key: `route-type-${routeType}`,
        label: formatRouteTypeLabel(routeType),
        onRemove: () => setSelectedRouteTypes((prev) => prev.filter((item) => item !== routeType)),
      })
    }

    return chips
  }, [gradeSystem, maxGrade, minGrade, minRating, minSends, searchQuery, selectedDirections, selectedRouteTypes, topoOnly])

  const highlightImageCard = useCallback((imageId: string) => {
    setHighlightedImageId(imageId)
    window.setTimeout(() => setHighlightedImageId((prev) => (prev === imageId ? null : prev)), 1400)
  }, [])

  const getImageDestination = useCallback((imageId: string) => {
    return buildCragImageDestination({
      imageId,
      target: defaultRouteTargetByImageId[imageId],
      routeHrefBase,
      offlineOnly: typeof navigator !== 'undefined' && navigator.onLine === false,
    })
  }, [defaultRouteTargetByImageId, routeHrefBase])

  const getRouteDestination = useCallback((route: CragRoute) => {
    if (isOfflineDocumentNavigationPreferred()) {
      return `/climb/${route.id}`
    }

    if (route.slug && routeHrefBase) {
      return `${routeHrefBase}/${route.slug}`
    }

    return `/climb/${route.id}`
  }, [routeHrefBase])

  const prefetchImageDestination = useCallback((imageId: string) => {
    if (!imageId) return
  }, [])

  const navigateToImageDestination = useCallback((imageId: string) => {
    const destination = getImageDestination(imageId)
    window.location.assign(destination)
  }, [getImageDestination])

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

  const redirectToAuth = useCallback(() => {
    router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/crag/${id}`)}`)
  }, [id, pathname, router])

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
  const canDownloadCrag = !offlineDialogLoading
  const projectedUsage = offlinePreview
    ? offlinePreview.usageBytes - (offlinePreview.existingPack?.estimatedBytes || 0) + (offlinePreview.deltaBytes || 0)
    : 0
  const overOfflineBudget = !!offlinePreview && projectedUsage > offlinePreview.budgetBytes
  const canSaveCragOffline = !offlineDialogLoading && !offlinePreviewLoading && !overOfflineBudget && !offlinePreview?.isUpToDate

  const handleOpenOfflineDialog = async () => {
    setOfflineDialogOpen(true)
    void refreshCragOfflinePreview()
  }

  const handleSaveCragOffline = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
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
      setToast(result.warning || (offlinePreview?.existingPack ? 'Offline crag pack updated' : 'Crag saved for offline use'))
      setTimeout(() => setToast(null), 3000)
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
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return
    }

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
      <div className="relative z-0 h-[34vh] md:h-[58vh] bg-gray-200 dark:bg-gray-800">
        <MapContainer
          ref={mapRef as React.RefObject<L.Map | null>}
          center={cragCenter || [crag.latitude || 0, crag.longitude || 0]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          preferCanvas={true}
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
                  highlightImageCard(image.id)
                },
              }}
            >
              <Popup
                closeButton={false}
                className="image-popup"
              >
                <div
                  className="w-40 cursor-pointer"
                  onMouseEnter={() => prefetchImageDestination(image.id)}
                  onTouchStart={() => prefetchImageDestination(image.id)}
                  onClick={() => {
                    navigateToImageDestination(image.id)
                  }}
                >
                  <div className="relative h-24 w-full overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
                    <Image
                      src={image.url}
                      alt={`${crag.name} topo image ${imageIndexById.get(image.id) ?? ''}`.trim()}
                      fill
                      className="object-cover"
                      sizes="160px"
                      unoptimized
                    />
                    {image.supplementary_faces_count > 0 && (
                      <div className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                        {1 + image.supplementary_faces_count} faces
                      </div>
                    )}
                    <div className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                      {imageIndexById.get(image.id) ?? ''}
                    </div>
                    <div className="absolute bottom-2 right-2 rounded-full bg-gray-900/80 px-2 py-1 text-xs text-white">
                      {image.route_lines_count} routes
                    </div>
                    <div className={`absolute top-2 right-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                      image.is_verified
                        ? 'bg-green-500 text-white'
                        : 'bg-yellow-500 text-white'
                    }`}>
                      {image.is_verified ? '✓' : `${image.verification_count}/3`}
                    </div>
                  </div>
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

      <div className="relative z-[1400] max-w-5xl mx-auto px-4 py-4 space-y-6">
        <section className="space-y-3">
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 max-w-sm">
                <button type="button" onClick={() => setCragSwitcherOpen((prev) => !prev)} className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <span className="truncate font-medium">{crag.name}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </button>
                {cragSwitcherOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[1300] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <Input value={cragSwitcherQuery} onChange={(event) => setCragSwitcherQuery(event.target.value)} placeholder="Search another crag" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
                    <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                      {cragSwitcherOptions.map((option) => {
                        const href = option.countryCode ? `/${option.countryCode.toLowerCase()}/${option.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}` : `/crag/${option.id}`
                        return (
                          <a key={option.id} href={option.id === crag.id ? `/crag/${option.id}` : href} className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-stone-50 dark:hover:bg-gray-800 ${option.id === crag.id ? 'bg-stone-100 font-medium text-stone-900 dark:bg-gray-800 dark:text-gray-100' : 'text-stone-700 dark:text-gray-200'}`} onClick={() => setCragSwitcherOpen(false)}>
                            <div>{option.name}</div>
                            <div className="text-xs text-stone-500 dark:text-gray-400">{option.subArea || option.regionName || 'Crag'}</div>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={handleOpenOfflineDialog} disabled={!canDownloadCrag} className="rounded-full border border-stone-200 bg-white p-2.5 text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                {offlineDialogLoading || offlinePreviewLoading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              </button>
              <button type="button" onClick={() => setSearchModalOpen(true)} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Search className="size-4" />
              </button>
              <button type="button" onClick={() => setFilterModalOpen(true)} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Filter className="size-4" />
              </button>
              <button type="button" onClick={() => setSortModalOpen(true)} className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <ArrowUpDown className="size-4" />
              </button>
              <div className="ml-auto text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">{filteredRoutes.length} routes</div>
            </div>
          </div>

          <div className="space-y-4">
            {routeInsightsUnavailable ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                Route intelligence is unavailable right now. Crag stats and sorting signals will appear again once the route metrics query is reachable.
              </div>
            ) : null}
            {activeRouteFilterChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeRouteFilterChips.map((chip) => (
                  <button key={chip.key} type="button" onClick={chip.onRemove} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                    {chip.label} ×
                  </button>
                ))}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {routesLoadState === 'loading' ? (
                <div className="px-4 py-6">
                  <div className="h-16 animate-pulse rounded-2xl bg-stone-100 dark:bg-gray-800" />
                </div>
              ) : routesLoadState === 'error' ? (
                <p className="px-4 py-4 text-sm text-stone-500 dark:text-gray-400">Route intelligence is unavailable right now.</p>
              ) : filteredRoutes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-stone-500 dark:text-gray-400">No routes match this filter combination.</p>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-gray-800">
                  {filteredRoutes.map((route) => (
                    <a key={route.id} href={getRouteDestination(route)} className="flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-gray-800/50">
                      {routePreviewByClimbId[route.id] ? (
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                          <Image src={routePreviewByClimbId[route.id].imageUrl} alt={`${route.name} topo preview`} fill className="object-cover" sizes="64px" unoptimized />
                        </div>
                      ) : (
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">No topo</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-semibold text-stone-900 dark:text-gray-100">{route.name}</span>
                          <span className="text-sm font-medium text-stone-600 dark:text-gray-300">{formatGradeForDisplay(route.grade, gradeSystem)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-stone-500 dark:text-gray-400">{routeLocationLabel}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-gray-300">
                          <span>{formatRatingValue(route.weightedRating)}{route.ratingCount > 0 ? ` (${route.ratingCount})` : ''}</span>
                          <span>{route.sendCount} ascents</span>
                          {route.routeType ? <span>{formatRouteTypeLabel(route.routeType)}</span> : null}
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-stone-400" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {(isOfflineCragMode ? offlineCragImageCards.length > 0 : orderedImages.length > 0) ? (
          <section className="space-y-4">
            <div>
            {isOfflineCragMode ? (
              offlineCragImageCards.length === 0 ? (
                null
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {offlineCragImageCards.map((imageCard) => (
                    <a key={imageCard.imageId} href={imageCard.href} id={`offline-image-card-${imageCard.imageId}`} className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 ${highlightedImageId === imageCard.imageId ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setHighlightedImageId(imageCard.imageId)}>
                      <div className="relative aspect-[4/3] bg-gray-200 dark:bg-gray-800">
                        <Image src={imageCard.imageUrl} alt={`${crag.name} topo image`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" unoptimized />
                        <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-gray-900 shadow-sm">{imageCard.routes.length} route{imageCard.routes.length === 1 ? '' : 's'}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )
            ) : orderedImages.length === 0 ? (
              null
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {orderedImages.map((image) => (
                  <div key={image.id} id={`crag-image-${image.id}`} ref={(el) => {
                    if (!el) return
                    imageCardRefs.current.set(image.id, el)
                  }} className={`block cursor-pointer overflow-hidden rounded-lg bg-white shadow-sm ring-2 ring-transparent transition-shadow hover:shadow-md dark:bg-gray-800 ${highlightedImageId === image.id ? 'ring-blue-400' : ''}`} onMouseEnter={() => prefetchImageDestination(image.id)} onTouchStart={() => prefetchImageDestination(image.id)} onClick={() => { navigateToImageDestination(image.id) }}>
                    <div className="relative h-32 bg-gray-200 dark:bg-gray-700">
                      <Image src={image.url} alt={`${crag.name} topo image ${imageIndexById.get(image.id) ?? ''}`.trim()} fill className="object-cover" sizes="(max-width: 768px) 33vw, 25vw" />
                      <div className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">{imageIndexById.get(image.id) ?? ''}</div>
                      <div className="absolute bottom-2 right-2 rounded-full bg-gray-900/80 px-2 py-1 text-xs text-white">{image.route_lines_count} routes</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="mb-6 space-y-4">
            <PlaceCommunityClient
              activeTab="upcoming"
              placeId={resolvedCommunityPlaceId}
              sessionPosts={initialSessionPosts}
              updatePosts={initialUpdatePosts}
            />
          </div>
          <div className="mb-6 space-y-4">
            <PlaceCommunityClient
              activeTab="updates"
              placeId={resolvedCommunityPlaceId}
              sessionPosts={initialSessionPosts}
              updatePosts={initialUpdatePosts}
            />
          </div>
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
        </section>
      </div>

      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Search climbs, areas, subareas</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="p-4">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search climbs here" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climbs</p>
                <div className="space-y-2">
                  {searchModalResults.length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">No climbs match yet.</p> : searchModalResults.map((route) => (
                    <a key={route.id} href={getRouteDestination(route)} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      <span>{route.name} <span className="text-stone-500">{formatGradeForDisplay(route.grade, gradeSystem)}</span></span>
                      <ChevronRight className="size-4 text-stone-400" />
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Area</p>
                <p className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 dark:border-gray-700 dark:text-gray-300">{routeLocationLabel}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Filter climbs</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-4 pb-24">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-900 dark:text-gray-100">Grade distribution</p>
                <span className="text-xs text-stone-500 dark:text-gray-400">Median {routeStats.medianGrade ? formatGradeForDisplay(routeStats.medianGrade, gradeSystem) : '—'}</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={routeStats.gradeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                    <XAxis dataKey="grade" tickFormatter={(value: string) => formatGradeForDisplay(value, gradeSystem)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={(value) => typeof value === 'string' ? formatGradeForDisplay(value, gradeSystem) : ''} formatter={(value) => {
                      const count = typeof value === 'number' ? value : Number(value || 0)
                      return [`${count} climbs`, 'Climbs']
                    }} />
                    <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-stone-700 dark:text-gray-300">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Min grade</span>
                <select value={minGrade} onChange={(event) => setMinGrade(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">Any</option>
                  {FILTER_GRADES.map((grade) => <option key={`modal-min-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
                </select>
              </label>
              <label className="text-sm text-stone-700 dark:text-gray-300">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Max grade</span>
                <select value={maxGrade} onChange={(event) => setMaxGrade(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">Any</option>
                  {FILTER_GRADES.map((grade) => <option key={`modal-max-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climb type</p>
              <div className="flex flex-wrap gap-2">
                {routeTypeChips.map((routeType) => (
                  <button key={routeType} type="button" onClick={() => setSelectedRouteTypes((prev) => prev.includes(routeType) ? prev.filter((item) => item !== routeType) : [...prev, routeType])} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedRouteTypes.includes(routeType) ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                    {formatRouteTypeLabel(routeType)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Face direction</p>
              <div className="flex flex-wrap gap-2">
                {availableDirections.map((direction) => (
                  <button key={direction} type="button" onClick={() => setSelectedDirections((prev) => prev.includes(direction) ? prev.filter((item) => item !== direction) : [...prev, direction])} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedDirections.includes(direction) ? 'border-stone-900 bg-stone-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                    {direction}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 border-t border-stone-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <Button className="w-full" onClick={() => setFilterModalOpen(false)}>Show results</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sortModalOpen} onOpenChange={setSortModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Sort climbs</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="p-4 space-y-2">
            <button type="button" onClick={() => { setRouteSort('sends'); setSortModalOpen(false) }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'sends' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
              <span>Ascents</span>
              <ChevronRight className="size-4" />
            </button>
            <button type="button" onClick={() => { setRouteSort('grade'); setSortModalOpen(false) }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'grade' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
              <span>Grade</span>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
            <Button onClick={handleSaveCragOffline} disabled={!canSaveCragOffline}>
              {offlineDialogLoading ? 'Syncing...' : offlinePreview?.existingPack ? 'Update offline pack' : 'Download crag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
