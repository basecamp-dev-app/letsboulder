
'use client'

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import type { MouseEvent } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Download, Filter, Loader2, Search, ArrowUpDown, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { GRADES, PUBLIC_GRADES, normalizeGrade } from '@/lib/grades'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import CragPageSkeleton from '@/app/crag/components/CragPageSkeleton'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { buildSelectableImageIdByImageId } from '@/lib/image-identity'
import { Button } from '@/components/ui/button'
import LightweightCragMap from '@/components/lightweight-crag-map'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildCragImageDestination, type ImageRouteTarget } from '@/app/crag/components/crag-image-destination'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import { Input } from '@/components/ui/input'
import { buildCragPinClusters, type ClusterableCragImage, type CragPinCluster } from '@/lib/crag-pin-clusters'
import type { Database } from '@/types/database'

function getAverageCoordinates(images: { latitude: number; longitude: number }[]): [number, number] {
  const totalLat = images.reduce((sum, img) => sum + img.latitude, 0)
  const totalLng = images.reduce((sum, img) => sum + img.longitude, 0)
  return [totalLat / images.length, totalLng / images.length]
}

const TopThisPlacePanel = dynamic(() => import('@/features/community/components/TopThisPlacePanel'))
const PlaceRankingsPanel = dynamic(() => import('@/features/community/components/PlaceRankingsPanel'))

const CRAG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const cragImageCache = new Map<string, CachedCragImageData>()

export interface Crag {
  id: string
  name: string
  slug: string | null
  country_id?: string | null
  country_code: string | null
  region_name?: string | null
  sub_area?: string | null
  country_name?: string | null
  admin_region_name?: string | null
  un_region_name?: string | null
  continent_name?: string | null
  latitude: number | null
  longitude: number | null
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  climbing_areas?: {
    id: string
    name: string
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}

interface RawImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  is_verified: boolean | null
  verification_count: number | null
  route_lines: Array<{ count: number }>
}

interface ClusteredImageData extends ClusterableCragImage {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}

interface OfflineHydratedCragData {
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cragCenter: [number, number] | null
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

interface ClimbIdentityRow {
  id: string
  shared_climb_id: string | null
}

interface CachedCragImageData {
  crag: Crag | null
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cachedAt: number
}

type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

type OrderedPinCluster = CragPinCluster<ClusteredImageData> & {
  badgeNumber: number
}

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

interface RouteNavigationTarget extends ImageRouteTarget {
  displayImageId: string
  displayImageUrl: string
}

interface ResolvedRouteDestination {
  href: string
  ready: boolean
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

function dedupeCragRoutes(routes: CragRoute[], effectiveClimbIdByClimbId: Record<string, string>) {
  const groupedRoutes = new Map<string, CragRoute>()

  for (const route of routes) {
    const effectiveClimbId = effectiveClimbIdByClimbId[route.id] || route.id
    const existing = groupedRoutes.get(effectiveClimbId)

    if (!existing) {
      groupedRoutes.set(effectiveClimbId, {
        ...route,
        id: effectiveClimbId,
      })
      continue
    }

    const isCanonicalRoute = route.id === effectiveClimbId
    groupedRoutes.set(effectiveClimbId, {
      ...existing,
      id: effectiveClimbId,
      name: isCanonicalRoute ? route.name : existing.name,
      grade: isCanonicalRoute ? route.grade : existing.grade,
      slug: isCanonicalRoute ? route.slug : (existing.slug || route.slug),
      routeType: existing.routeType || route.routeType,
      directions: sortDirections([...existing.directions, ...route.directions]),
      hasTopo: existing.hasTopo || route.hasTopo,
      topoImageCount: Math.max(existing.topoImageCount, route.topoImageCount),
      ratingAvg: existing.ratingAvg ?? route.ratingAvg,
      ratingCount: Math.max(existing.ratingCount, route.ratingCount),
      weightedRating: existing.weightedRating ?? route.weightedRating,
      sendCount: Math.max(existing.sendCount, route.sendCount),
      recentSendCount60d: Math.max(existing.recentSendCount60d, route.recentSendCount60d),
    })
  }

  return [...groupedRoutes.values()]
}

function remapRoutePreviewsByEffectiveClimbId(
  routePreviewByClimbId: Record<string, RoutePreview>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextPreviewByClimbId: Record<string, RoutePreview> = {}

  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
    if (!nextPreviewByClimbId[effectiveClimbId]) {
      nextPreviewByClimbId[effectiveClimbId] = preview
    }
  }

  return nextPreviewByClimbId
}

function buildEffectiveClimbLookup(rows: ClimbIdentityRow[]) {
  const effectiveClimbIdByClimbId = Object.fromEntries(
    rows.map((row) => [row.id, row.shared_climb_id || row.id])
  )

  const climbIdsByEffectiveClimbId = rows.reduce<Record<string, string[]>>((acc, row) => {
    const effectiveClimbId = row.shared_climb_id || row.id
    const existing = acc[effectiveClimbId] || []
    existing.push(row.id)
    acc[effectiveClimbId] = existing
    return acc
  }, {})

  return { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId }
}

function mapRouteTargetsByEffectiveClimbId(
  routeTargetsData: RouteLineTargetRow[],
  imageById: Map<string, ImageData | ClusteredImageData>,
  effectiveClimbIdByClimbId: Record<string, string>,
  selectableImageIdByImageId: Record<string, string> = {}
) {
  const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
  const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}

  for (const row of routeTargetsData) {
    const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
    if (nextRouteNavigationTargetByClimbId[effectiveClimbId]) continue
    const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
    const image = imageById.get(selectableImageId)
    if (!image) continue
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    nextRoutePreviewByClimbId[effectiveClimbId] = {
      imageId: selectableImageId,
      imageUrl: image.url,
    }
    nextRouteNavigationTargetByClimbId[effectiveClimbId] = {
      climbId: effectiveClimbId,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: selectableImageId,
      displayImageId: selectableImageId,
      displayImageUrl: image.url,
    }
  }

  return { nextRoutePreviewByClimbId, nextRouteNavigationTargetByClimbId }
}

function hydrateOfflineCragData(payloads: ClimbPackResponse[]): OfflineHydratedCragData {
  const imageMap = new Map<string, ImageData>()
  const routeImageIdsByClimbId: Record<string, string[]> = {}
  const routePreviewByClimbId: Record<string, RoutePreview> = {}
  const defaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
  const routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}
  const routeMap = new Map<string, CragRoute>()

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

    for (const line of payload.primary_route_lines || []) {
      const climbImageIds = routeImageIdsByClimbId[line.climb_id] || []
      if (!climbImageIds.includes(primaryImage.id)) {
        climbImageIds.push(primaryImage.id)
        routeImageIdsByClimbId[line.climb_id] = climbImageIds
      }
      if (routePreviewByClimbId[line.climb_id]) continue
      routePreviewByClimbId[line.climb_id] = {
        imageId: primaryImage.id,
        imageUrl: primaryImage.url,
      }
      routeNavigationTargetByClimbId[line.climb_id] = {
        climbId: line.climb_id,
        routeId: line.id,
        climbSlug: getOfflineSlug(payload.offline_pack.canonicalPath, climb.id),
        imageId: primaryImage.id,
        displayImageId: primaryImage.id,
        displayImageUrl: primaryImage.url,
      }
    }
  }

  const imagesWithCoordinates = Array.from(imageMap.values()).filter(
    (image): image is ImageData & { latitude: number; longitude: number } => typeof image.latitude === 'number' && typeof image.longitude === 'number'
  )
  const cragCenter = imagesWithCoordinates.length > 0
    ? getAverageCoordinates(imagesWithCoordinates)
    : null

  return {
    images: Array.from(imageMap.values()),
    routes: Array.from(routeMap.values()),
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    defaultRouteTargetByImageId,
    routeNavigationTargetByClimbId,
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

function sortPinClusters(clusters: OrderedPinCluster[], center: [number, number] | null) {
  const sortable = [...clusters]

  sortable.sort((a, b) => {
    if (center) {
      const aBearing = bearingDegrees(center, [a.latitude, a.longitude])
      const bBearing = bearingDegrees(center, [b.latitude, b.longitude])
      if (aBearing !== bBearing) return aBearing - bBearing

      const aDistance = haversineMeters(center, [a.latitude, a.longitude])
      const bDistance = haversineMeters(center, [b.latitude, b.longitude])
      if (aDistance !== bDistance) return aDistance - bDistance
    }

    if (a.latitude !== b.latitude) return b.latitude - a.latitude
    if (a.longitude !== b.longitude) return a.longitude - b.longitude
    return a.id.localeCompare(b.id)
  })

  return sortable.map((cluster, index) => ({
    ...cluster,
    badgeNumber: index + 1,
  }))
}

interface CragPageClientProps {
  id: string
  initialCrag?: Crag | null
  initialImages?: ImageData[]
  initialRoutes?: CragRoute[] | null
  initialRouteImageIdsByClimbId?: Record<string, string[]>
  initialRoutePreviewByClimbId?: Record<string, RoutePreview>
  initialCragCenter?: [number, number] | null
  communityPlaceSlug?: string | null
}

export default function CragPageClient({
  id,
  initialCrag = null,
  initialImages = [],
  initialRoutes = null,
  initialRouteImageIdsByClimbId = {},
  initialRoutePreviewByClimbId = {},
  initialCragCenter = null,
  communityPlaceSlug,
}: CragPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const gradeSystem = useGradeSystem()
  const [crag, setCrag] = useState<Crag | null>(initialCrag)
  const hasInitialRouteData = initialRoutes !== null
  const [images, setImages] = useState<ImageData[]>(initialImages)
  const [routes, setRoutes] = useState<CragRoute[]>(initialRoutes || [])
  const [routeImageIdsByClimbId, setRouteImageIdsByClimbId] = useState<Record<string, string[]>>(initialRouteImageIdsByClimbId)
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineDialogLoading, setOfflineDialogLoading] = useState(false)
  const [offlinePreviewLoading, setOfflinePreviewLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlinePreview, setOfflinePreview] = useState<Awaited<ReturnType<typeof getCragOfflinePreview>> | null>(null)
  const [offlineProgress, setOfflineProgress] = useState<OfflineJobProgressEvent | null>(null)
  const [defaultRouteTargetByImageId, setDefaultRouteTargetByImageId] = useState<Record<string, ImageRouteTarget>>({})
  const [routeNavigationTargetByClimbId, setRouteNavigationTargetByClimbId] = useState<Record<string, RouteNavigationTarget>>({})

  const initialRouteSource = useMemo(() => initialRoutes || [], [initialRoutes])

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
        regionName: sourceCrag.region_name || sourceCrag.climbing_areas?.name || null,
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
  }, [cragSwitcherQuery, initialCrag])

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
        setRoutesLoadState('loaded')
        setRouteImageIdsByClimbId(hydrated.routeImageIdsByClimbId)
        setRoutePreviewByClimbId(hydrated.routePreviewByClimbId)
        setDefaultRouteTargetByImageId(hydrated.defaultRouteTargetByImageId)
        setRouteNavigationTargetByClimbId(hydrated.routeNavigationTargetByClimbId)
        setCrag(initialCrag)
        setCragCenter(hydrated.cragCenter)
        setLoading(false)
        return true
      }

      setImages([])
      if (!hasInitialRouteData) {
        setRoutes([])
        setRouteImageIdsByClimbId({})
      }
      setDefaultRouteTargetByImageId({})
      setRouteNavigationTargetByClimbId({})
      if (!hasInitialRouteData) {
        setRoutePreviewByClimbId({})
      }
      if (!initialCragCenter) {
        setCragCenter(null)
      }

      const cached = cragImageCache.get(id)
      if (cached && Date.now() - cached.cachedAt <= CRAG_IMAGE_CACHE_TTL_MS) {
        setCrag(cached.crag)
        setImages(cached.images)
        setCragCenter(cached.cragCenter)
        setDefaultRouteTargetByImageId(cached.defaultRouteTargetByImageId)
        setRouteImageIdsByClimbId(cached.routeImageIdsByClimbId || {})
        setRouteNavigationTargetByClimbId(cached.routeNavigationTargetByClimbId)
        setRoutePreviewByClimbId(cached.routePreviewByClimbId)
        setLoading(false)
      } else {
      if (!initialCrag) {
        setLoading(true)
      }
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
        .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
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
              climbing_areas:region_id (id, name)
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

      const supplementaryImageIds = new Set<string>(
        (supplementaryImageIdsData || [])
          .flatMap((row: { linked_image_id: string | null; source_image_id?: string | null }) => [row.linked_image_id, row.source_image_id || null])
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

      const allImagesData = (imagesData || []) as RawImageRow[]
      const knownImageIds = new Set(allImagesData.map((image) => image.id))
      const missingSupplementaryImageIds = Array.from(supplementaryImageIds).filter((imageId) => !knownImageIds.has(imageId))

      let supplementaryImagesData: RawImageRow[] = []
      if (missingSupplementaryImageIds.length > 0) {
        const { data: extraImagesData, error: extraImagesError } = await supabase
          .from('images')
          .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
          .in('id', missingSupplementaryImageIds)

        if (extraImagesError) {
          console.error('Error fetching supplementary images:', extraImagesError)
        } else {
          supplementaryImagesData = (extraImagesData || []) as RawImageRow[]
        }
      }

      const mergedImagesData = [...allImagesData, ...supplementaryImagesData]
      const selectableImageIdByImageId = buildSelectableImageIdByImageId(
        mergedImagesData.map((image) => ({
          id: image.id,
          latitude: image.latitude,
          longitude: image.longitude,
        })),
        (supplementaryImageIdsData || []) as Array<{ linked_image_id: string | null; source_image_id: string | null }>
      )

      const primaryImagesData = mergedImagesData.filter(
        (img: { id: string; url: string }) => !supplementaryImageIds.has(img.id) && !supplementaryImageUrls.has(img.url)
      )

      if ((imagesError || supplementaryImageIdsError || primaryImagesData.length === 0) && applyOfflineHydratedState()) {
        return
      }

      const formatImageRow = (img: RawImageRow): ImageData => {
        const routeLinesCount = Array.isArray(img.route_lines) && img.route_lines[0]
          ? img.route_lines[0].count
          : 0
        return {
          id: img.id,
          url: resolveRouteImageUrl(img.url),
          latitude: img.latitude,
          longitude: img.longitude,
          created_at: img.created_at ?? null,
          is_verified: img.is_verified || false,
          verification_count: img.verification_count || 0,
          route_lines_count: routeLinesCount,
          supplementary_faces_count: supplementaryCountByPrimaryId[img.id] || 0,
        }
      }

      const formattedImages: ImageData[] = primaryImagesData.map(formatImageRow)
      const previewImages = mergedImagesData.map(formatImageRow)

      const routeSource: CragRoute[] = hasInitialRouteData ? routes : initialRouteSource
      const routeClimbIds = Array.from(new Set(routeSource.map((route) => route.id).filter(Boolean)))
      const nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
      const nextRouteImageIdsByClimbId: Record<string, string[]> = {}
      const imageById = new Map(previewImages.map((image) => [image.id, image]))
      const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
      const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}

      if (routeClimbIds.length > 0) {
        const { data: climbIdentityData, error: climbIdentityError } = await supabase
          .from('climbs')
          .select('id, shared_climb_id')
          .or(`id.in.(${routeClimbIds.join(',')}),shared_climb_id.in.(${routeClimbIds.join(',')})`)

        if (climbIdentityError) {
          console.error('Error fetching climb identities for route targets:', climbIdentityError)
        }

        const { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId } = buildEffectiveClimbLookup(
          (climbIdentityData || []) as ClimbIdentityRow[]
        )
        const routeLineClimbIds = Array.from(new Set([
          ...routeClimbIds,
          ...routeClimbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || []),
        ]))

        const { data: routeTargetsData, error: routeTargetsError } = await supabase
          .from('route_lines')
          .select('id, image_id, climb_id, climbs(slug)')
          .in('climb_id', routeLineClimbIds)
          .order('climb_id', { ascending: true })
          .order('sequence_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })

        if (routeTargetsError) {
          console.error('Error fetching image route targets:', routeTargetsError)
        } else {
          for (const row of (routeTargetsData || []) as RouteLineTargetRow[]) {
            const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
            const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
            const climbImageIds = nextRouteImageIdsByClimbId[effectiveClimbId] || []
            if (!climbImageIds.includes(selectableImageId)) {
              climbImageIds.push(selectableImageId)
              nextRouteImageIdsByClimbId[effectiveClimbId] = climbImageIds
            }
            if (nextDefaultRouteTargetByImageId[selectableImageId]) continue
            const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
            nextDefaultRouteTargetByImageId[selectableImageId] = {
              climbId: row.climb_id,
              routeId: row.id,
              climbSlug: climb?.slug || null,
              imageId: selectableImageId,
            }
          }

          const mappedTargets = mapRouteTargetsByEffectiveClimbId(
            (routeTargetsData || []) as RouteLineTargetRow[],
            imageById,
            effectiveClimbIdByClimbId,
            selectableImageIdByImageId
          )

          Object.assign(nextRoutePreviewByClimbId, mappedTargets.nextRoutePreviewByClimbId)
          Object.assign(nextRouteNavigationTargetByClimbId, mappedTargets.nextRouteNavigationTargetByClimbId)
          console.debug('[Router Debug] Target Map populated with keys:', Object.keys(mappedTargets.nextRouteNavigationTargetByClimbId))
        }
      }

      if (ignore) return

      setCrag(cragData)
      setImages(previewImages)
      setDefaultRouteTargetByImageId(nextDefaultRouteTargetByImageId)
      setRouteImageIdsByClimbId(nextRouteImageIdsByClimbId)
      setRoutePreviewByClimbId(nextRoutePreviewByClimbId)
      setRouteNavigationTargetByClimbId(nextRouteNavigationTargetByClimbId)
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
        images: previewImages,
        cragCenter: nextCenter,
        defaultRouteTargetByImageId: nextDefaultRouteTargetByImageId,
        routeImageIdsByClimbId: nextRouteImageIdsByClimbId,
        routePreviewByClimbId: nextRoutePreviewByClimbId,
        routeNavigationTargetByClimbId: nextRouteNavigationTargetByClimbId,
        cachedAt: Date.now(),
      })
    }

    loadCrag()

    return () => {
      ignore = true
    }
  }, [hasInitialRouteData, id, initialCrag, initialCragCenter, initialRouteSource, routes])

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
      let effectiveClimbData
      let effectiveClimbError
      try {
        const response = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: id })
        routeMetricsData = response.data
        routeMetricsError = response.error

        if (response.data && response.data.length > 0) {
          const routeRows = response.data as CragRouteIntelligenceRow[]
          const climbIds = routeRows.map((route: CragRouteIntelligenceRow) => route.id)
          const effectiveClimbResponse = await supabase
            .from('climbs')
            .select('id, shared_climb_id')
            .in('id', climbIds)

          effectiveClimbData = effectiveClimbResponse.data
          effectiveClimbError = effectiveClimbResponse.error
        }
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

      if (effectiveClimbError) {
        console.error('Error fetching effective climb ids:', effectiveClimbError)
      }

      if (!routeMetricsData || routeMetricsData.length === 0) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
      }

      const nextRoutes = formatCragRoutes(routeMetricsData as CragRouteIntelligenceRow[] | null | undefined)
      const effectiveClimbIdByClimbId = Object.fromEntries(
        ((effectiveClimbData || []) as Array<{ id: string; shared_climb_id: string | null }>).map((row) => [row.id, row.shared_climb_id || row.id])
      )
      setRoutes(dedupeCragRoutes(nextRoutes, effectiveClimbIdByClimbId))
      setRoutePreviewByClimbId((prev) => remapRoutePreviewsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))
      setRouteNavigationTargetByClimbId((prev) => {
        const nextTargets: Record<string, RouteNavigationTarget> = {}

        for (const [climbId, target] of Object.entries(prev)) {
          const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
          if (!nextTargets[effectiveClimbId]) {
            nextTargets[effectiveClimbId] = target.climbId === effectiveClimbId
              ? target
              : {
                  ...target,
                  climbId: effectiveClimbId,
                }
          }
        }

        return nextTargets
      })
      setRoutesLoadState('loaded')
    }

    loadRoutesForFilters()

    return () => {
      ignore = true
    }
  }, [id, routesLoadState])

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

  const imageById = useMemo(() => {
    return new Map(orderedImages.map((image) => [image.id, image as ClusteredImageData]))
  }, [orderedImages])

  const clusteredPins = useMemo(() => {
    return buildCragPinClusters(orderedImages as ClusteredImageData[], 6)
  }, [orderedImages])

  const orderedPinClusters = useMemo(() => {
    return sortPinClusters(
      clusteredPins.clusters.map((cluster) => ({ ...cluster, badgeNumber: 0 })),
      viewCenter
    )
  }, [clusteredPins.clusters, viewCenter])

  const mapPins = useMemo(() => {
    return orderedPinClusters.map((cluster) => ({
      id: cluster.representativeImageId,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      label: String(cluster.badgeNumber),
    }))
  }, [orderedPinClusters])

  const pinNumberByImageId = useMemo(() => {
    const mapping = new Map<string, number>()
    orderedPinClusters.forEach((cluster) => {
      cluster.images.forEach((image: ClusteredImageData) => {
        mapping.set(image.id, cluster.badgeNumber)
      })
    })
    return mapping
  }, [orderedPinClusters])

  const routePreviewDisplayByClimbId = useMemo(() => {
    const nextPreviews: Record<string, RoutePreview> = {}

    for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
      const image = imageById.get(preview.imageId)
      nextPreviews[climbId] = {
        imageId: image?.id || preview.imageId,
        imageUrl: image?.url || preview.imageUrl,
      }
    }

    return nextPreviews
  }, [imageById, routePreviewByClimbId])

  const routeNavigationDisplayByClimbId = useMemo(() => {
    const nextTargets: Record<string, RouteNavigationTarget> = {}

    for (const [climbId, target] of Object.entries(routeNavigationTargetByClimbId)) {
      const displayImage = imageById.get(target.displayImageId)

      nextTargets[climbId] = {
        ...target,
        displayImageId: target.displayImageId,
        displayImageUrl: displayImage?.url || target.displayImageUrl,
      }
    }

    return nextTargets
  }, [imageById, routeNavigationTargetByClimbId])

  const selectedImageIds = useMemo(() => {
    if (!selectedImageId) return new Set<string>()

    const selectedClusterId = clusteredPins.clusterIdByImageId.get(selectedImageId)
    if (!selectedClusterId) return new Set([selectedImageId])

    const selectedCluster = clusteredPins.clusters.find((cluster) => cluster.id === selectedClusterId)
    if (!selectedCluster) return new Set([selectedImageId])

    return new Set(selectedCluster.images.map((image) => image.id))
  }, [clusteredPins.clusterIdByImageId, clusteredPins.clusters, selectedImageId])

  const highlightedRouteIds = useMemo(() => {
    if (!selectedImageId) return new Set<string>()

    const matches = new Set<string>()
    for (const route of routes) {
      const routeImageIds = routeImageIdsByClimbId[route.id] || []
      if (routeImageIds.some((imageId) => selectedImageIds.has(imageId))) {
        matches.add(route.id)
        continue
      }

      if (routePreviewDisplayByClimbId[route.id]?.imageId && selectedImageIds.has(routePreviewDisplayByClimbId[route.id].imageId)) {
        matches.add(route.id)
        continue
      }

      if (routeNavigationDisplayByClimbId[route.id]?.displayImageId && selectedImageIds.has(routeNavigationDisplayByClimbId[route.id].displayImageId)) {
        matches.add(route.id)
      }
    }

    return matches
  }, [routeImageIdsByClimbId, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId, routes, selectedImageIds, selectedImageId])

  const selectedRouteCount = useMemo(() => {
    if (!selectedImageId) return 0
    return routes.reduce((count, route) => count + (highlightedRouteIds.has(route.id) ? 1 : 0), 0)
  }, [highlightedRouteIds, routes, selectedImageId])

  useEffect(() => {
    if (!selectedImageId) return

    console.debug('[Crag Debug] Pin selection state', {
      selectedImageId,
      selectedImageIds: Array.from(selectedImageIds),
      highlightedRouteIds: Array.from(highlightedRouteIds),
      routeImageIdsByClimbIdKeys: Object.keys(routeImageIdsByClimbId),
      routeCount: routes.length,
    })
  }, [highlightedRouteIds, routeImageIdsByClimbId, routes, selectedImageId, selectedImageIds])

  const climbIdsFingerprint = useMemo(() => {
    return Array.from(new Set(routes.map((route) => route.id)))
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  }, [routes])

  useEffect(() => {
    if (!climbIdsFingerprint || isOfflineDocumentNavigationPreferred()) return

    let ignore = false

    async function rebuildRouteTargets() {
      const supabase = createClient()
      const climbIds = climbIdsFingerprint.split(',').filter(Boolean)
      if (climbIds.length === 0) return

      const { data: climbIdentityData, error: climbIdentityError } = await supabase
        .from('climbs')
        .select('id, shared_climb_id')
        .or(`id.in.(${climbIds.join(',')}),shared_climb_id.in.(${climbIds.join(',')})`)

      if (climbIdentityError) {
        console.error('Error fetching climb identities while rebuilding route navigation targets:', climbIdentityError)
      }

      const { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId } = buildEffectiveClimbLookup(
        (climbIdentityData || []) as ClimbIdentityRow[]
      )
      const routeLineClimbIds = Array.from(new Set([
        ...climbIds,
        ...climbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || []),
      ]))

      const { data: routeTargetsData, error: routeTargetsError } = await supabase
        .from('route_lines')
        .select('id, image_id, climb_id, climbs(slug)')
        .in('climb_id', routeLineClimbIds)
        .order('climb_id', { ascending: true })
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (routeTargetsError) {
        console.error('Error rebuilding route navigation targets:', routeTargetsError)
        return
      }

      const mappedTargets = mapRouteTargetsByEffectiveClimbId(
        (routeTargetsData || []) as RouteLineTargetRow[],
        imageById,
        effectiveClimbIdByClimbId
      )

      if (ignore) return

      setRoutePreviewByClimbId((prev) => ({ ...prev, ...mappedTargets.nextRoutePreviewByClimbId }))
      setRouteNavigationTargetByClimbId((prev) => ({ ...prev, ...mappedTargets.nextRouteNavigationTargetByClimbId }))

      console.debug('[Router Debug] Target Map populated with keys:', Object.keys(mappedTargets.nextRouteNavigationTargetByClimbId))

      const cached = cragImageCache.get(id)
      if (cached) {
        cragImageCache.set(id, {
          ...cached,
          routePreviewByClimbId: { ...cached.routePreviewByClimbId, ...mappedTargets.nextRoutePreviewByClimbId },
          routeNavigationTargetByClimbId: { ...cached.routeNavigationTargetByClimbId, ...mappedTargets.nextRouteNavigationTargetByClimbId },
        })
      }
    }

    void rebuildRouteTargets()

    return () => {
      ignore = true
    }
  }, [climbIdsFingerprint, id, imageById])

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
          const aHighlighted = highlightedRouteIds.has(a.id)
          const bHighlighted = highlightedRouteIds.has(b.id)
          if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
          if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
          if ((a.weightedRating ?? -1) !== (b.weightedRating ?? -1)) return (b.weightedRating ?? -1) - (a.weightedRating ?? -1)
          const gradeCompare = compareGrades(a.grade, b.grade)
          if (gradeCompare !== 0) return gradeCompare
          return a.name.localeCompare(b.name)
        }

        if (routeSort === 'rating') {
          const aHighlighted = highlightedRouteIds.has(a.id)
          const bHighlighted = highlightedRouteIds.has(b.id)
          if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
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
          const aHighlighted = highlightedRouteIds.has(a.id)
          const bHighlighted = highlightedRouteIds.has(b.id)
          if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
          return a.name.localeCompare(b.name)
        }

        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        const gradeCompare = compareGrades(a.grade, b.grade)
        if (gradeCompare !== 0) return gradeCompare
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        return a.name.localeCompare(b.name)
      })
  }, [highlightedRouteIds, maxGrade, minGrade, minRating, minSends, routeSort, routes, searchQuery, selectedDirections, selectedRouteTypes, topoOnly])

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
  const routeLocationLabel = crag?.sub_area || crag?.region_name || crag?.climbing_areas?.name || 'Area details pending'

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

  const getRouteDestination = useCallback((route: CragRoute): ResolvedRouteDestination => {
    const offlineOnly = isOfflineDocumentNavigationPreferred()
    const routeTarget = routeNavigationDisplayByClimbId[route.id]
    if (routeTarget) {
      const routeClimbId = routeTarget.climbId || route.id
      return {
        href: buildCragImageDestination({
          imageId: routeTarget.displayImageId,
          target: {
            ...routeTarget,
            climbId: routeClimbId,
            climbSlug: route.slug || routeTarget.climbSlug,
          },
          routeHrefBase,
          offlineOnly,
        }),
        ready: true,
      }
    }

    const preview = routePreviewDisplayByClimbId[route.id]
    const fallbackImageId = preview?.imageId
    const fallbackTarget = fallbackImageId ? defaultRouteTargetByImageId[fallbackImageId] : undefined

    if (fallbackImageId && fallbackTarget) {
      return {
        href: buildCragImageDestination({
          imageId: fallbackImageId,
          target: {
            ...fallbackTarget,
            climbId: fallbackTarget.climbId || route.id,
            routeId: fallbackTarget.routeId || route.id,
            climbSlug: route.slug || fallbackTarget.climbSlug,
          },
          routeHrefBase,
          offlineOnly,
        }),
        ready: true,
      }
    }

    if (!offlineOnly && fallbackImageId) {
      return {
        href: buildCragImageDestination({
          imageId: fallbackImageId,
          routeHrefBase,
          offlineOnly: false,
        }),
        ready: false,
      }
    }

    console.warn(`[Router Debug] Route target miss for climb_id: ${route.id}. Falling back to slug.`)

    if (offlineOnly) {
      return {
        href: `/climb/${route.id}`,
        ready: true,
      }
    }

    if (route.slug && routeHrefBase) {
      return {
        href: `${routeHrefBase}/${route.slug}`,
        ready: false,
      }
    }

    return {
      href: `/climb/${route.id}`,
      ready: false,
    }
  }, [defaultRouteTargetByImageId, routeHrefBase, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId])

  const handlePendingRouteNavigation = useCallback((event: MouseEvent<HTMLButtonElement>, route: CragRoute) => {
    event.preventDefault()
    const destination = getRouteDestination(route)
    if (!destination.ready) return
    router.push(destination.href)
  }, [getRouteDestination, router])

  const prefetchImageDestination = useCallback((imageId: string) => {
    if (!imageId) return
  }, [])

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
    startTransition(() => {
      router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/crag/${id}`)}`)
    })
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
        <LightweightCragMap
          pins={mapPins}
          activePinId={selectedImageId}
          initialCenter={cragCenter}
          onPinSelect={(imageId) => {
            console.debug('[Crag Debug] Pin clicked', {
              imageId,
              currentSelectedImageId: selectedImageId,
              clusterId: clusteredPins.clusterIdByImageId.get(imageId) || null,
            })
            setSelectedImageId(imageId)
          }}
        />

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

      <div className="relative max-w-5xl mx-auto px-4 py-4 space-y-6">
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
              <div className="ml-auto text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">
                {selectedImageId ? `${selectedRouteCount} / ${routes.length} selected` : ''}
                {selectedImageId ? ' · ' : ''}
                {filteredRoutes.length} routes
              </div>
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
                  {filteredRoutes.map((route) => {
                    const destination = getRouteDestination(route)
                    const className = `flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-gray-800/50 ${highlightedRouteIds.has(route.id) ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/20 dark:ring-teal-900' : ''}`

                    const content = (
                      <>
                        {routePreviewDisplayByClimbId[route.id] ? (
                          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <Image src={routePreviewDisplayByClimbId[route.id].imageUrl} alt={`${route.name} topo preview`} fill className="object-cover" sizes="64px" />
                            {pinNumberByImageId.get(routePreviewDisplayByClimbId[route.id].imageId) ? (
                              <div className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white/95 text-[10px] font-semibold text-stone-900 shadow-sm dark:bg-gray-900/95 dark:text-gray-100">
                                {pinNumberByImageId.get(routePreviewDisplayByClimbId[route.id].imageId)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">No topo</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-stone-900 dark:text-gray-100">{route.name}</span>
                            <span className="text-sm font-medium text-stone-600 dark:text-gray-300">{formatGradeForDisplay(route.grade, gradeSystem)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-gray-300">
                            <span>{formatRatingValue(route.weightedRating)}{route.ratingCount > 0 ? ` (${route.ratingCount})` : ''}</span>
                            <span>{route.sendCount} ascents</span>
                            {route.routeType ? <span>{formatRouteTypeLabel(route.routeType)}</span> : null}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-stone-400" />
                      </>
                    )

                    if (!destination.ready) {
                      return (
                        <button key={route.id} type="button" onClick={(event) => handlePendingRouteNavigation(event, route)} className={`${className} w-full text-left`}>
                          {content}
                        </button>
                      )
                    }

                    return (
                      <a key={route.id} href={destination.href} className={className}>
                        {content}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
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
                  {searchModalResults.length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">No climbs match yet.</p> : searchModalResults.map((route) => {
                    const destination = getRouteDestination(route)
                    const content = (
                      <>
                        <span>{route.name} <span className="text-stone-500">{formatGradeForDisplay(route.grade, gradeSystem)}</span></span>
                        <ChevronRight className="size-4 text-stone-400" />
                      </>
                    )

                    if (!destination.ready) {
                      return (
                        <button key={route.id} type="button" onClick={(event) => handlePendingRouteNavigation(event, route)} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                          {content}
                        </button>
                      )
                    }

                    return (
                      <a key={route.id} href={destination.href} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                        {content}
                      </a>
                    )
                  })}
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
