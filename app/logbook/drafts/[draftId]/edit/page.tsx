'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Link2, Loader2, MapPin, Search, Trash2, Users } from 'lucide-react'
import { useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { UserResponse } from '@supabase/supabase-js'
import 'leaflet/dist/leaflet.css'
import { type UnifiedRouteCanvasRef } from '@/components/UnifiedRouteCanvas'
import { type LightweightCragMapPin } from '@/components/lightweight-crag-map'
import { SubmissionWorkstation } from '@/components/SubmissionWorkstation'
import { useRouteStore } from '@/store/routeStore'
import CragSelector from '@/app/submit/components/CragSelector'
import SectorSelector from '@/app/submit/components/SectorSelector'
import AtlasContextCard from '@/components/submissions/atlas-context-card'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/hooks/useCsrf'
import { useAtlasAutoSync } from '@/hooks/use-atlas-auto-sync'
import { useDraftUploadManager, useMediaUploadManager, type MediaUploadItem, type UploadCompleteCallback } from '@/lib/media/media-upload-manager'
import { uploadDebug } from '@/lib/media/upload-debug'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import type { ClimbType } from '@/lib/submission-types'
import { FACE_DIRECTIONS, type FaceDirection, type ImageSelection, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { normalizeDraftMetadata, serializeDraftMetadataV2, type OrientationDirection } from '@/lib/draft-metadata'
import { createClient } from '@/lib/supabase'
import { buildMapPins, reorderItemsByIds, resequenceRoutes, resolveLocationMode } from '@/lib/editor-image-state'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })

interface DraftImagePayload {
  id: string
  display_order: number
  route_data: Record<string, unknown> | null
  proxy_url: string | null
  readiness_status: 'ready' | 'processing' | 'error'
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
}

interface DraftPayload {
  id: string
  user_id: string
  crag_id: string | null
  status: string
  updated_at: string
  last_edited_by: string | null
  metadata: Record<string, unknown> | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
}

function isDraftImageReady(image: DraftImagePayload): boolean {
  return (image.readiness_status === 'ready' || image.readiness_status === 'processing') && !!image.proxy_url
}

interface CragImagePayload {
  id: string
  signed_url: string | null
  linked_image_id: string | null
  display_image_id?: string | null
  width: number | null
  height: number | null
  latitude?: number | null
  longitude?: number | null
}

interface CollaboratorItem {
  userId: string
  role: string
  createdAt: string
  profile: {
    displayName: string
    username: string | null
    avatarUrl: string | null
  }
}

interface InviteItem {
  id: string
  token: string
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  createdAt: string
}

interface DraftSavePayload {
  images: Array<{
    id: string
    display_order: number
    route_data: Record<string, unknown>
  }>
  cragId: string | null
  metadata: Record<string, unknown>
}

interface CanvasSourceMetadata {
  submission?: {
    canvasSource?: {
      kind?: 'draft-image' | 'crag-image'
      draftImageId?: string
      cragImageId?: string
      cragId?: string
    }
  }
}

interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data?: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name?: string | null
  }
}

interface DraftDeleteImageResponse {
  success: boolean
  deleted_image_id?: string
  draft?: {
    updated_at?: string
    metadata?: Record<string, unknown> | null
  } | null
}

interface ConflictState {
  serverUpdatedAt: string
  lastEditorName: string | null
  pendingChanges: DraftSavePayload
}

interface DraftRoute {
  id: string
  name: string
  grade: string
  description?: string
  climbType?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

interface EditableRoute {
  id: string
  name: string
  grade: string
  climbType?: string
  description?: string
  points: RoutePoint[]
}

interface ManageImageTab {
  imageId: string
  sourceKind: 'draft-image' | 'crag-image'
  index: number
  label: string
  signedUrl: string
  latitude: number | null
  longitude: number | null
  locationMode?: 'shared' | 'custom'
  status?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  error?: string | null
  pendingClientId?: string | null
}

type DraftCanvasSource =
  | { kind: 'draft-image'; draftImageId: string }
  | { kind: 'crag-image'; cragImageId: string; cragId: string }

interface PublishedCragImagePin {
  id: string
  latitude: number
  longitude: number
}

const CREDIT_PLATFORM_OPTIONS: Array<{ value: SubmissionCreditPlatform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
]

function parseRoutesFromRouteData(routeData: Record<string, unknown> | null, fallbackWidth: number, fallbackHeight: number): DraftRoute[] {
  const raw = routeData && typeof routeData === 'object'
    ? (routeData as { completedRoutes?: unknown }).completedRoutes
    : null
  if (!Array.isArray(raw)) return []

  const routes: DraftRoute[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const candidate = item as {
      id?: unknown
      name?: unknown
      grade?: unknown
      description?: unknown
      climbType?: unknown
      points?: unknown
      sequenceOrder?: unknown
      imageWidth?: unknown
      imageHeight?: unknown
    }

    const points = Array.isArray(candidate.points)
      ? candidate.points
        .filter((point) => point && typeof point === 'object' && typeof (point as { x?: unknown }).x === 'number' && typeof (point as { y?: unknown }).y === 'number')
        .map((point) => ({ x: (point as { x: number }).x, y: (point as { y: number }).y }))
      : []

    if (points.length < 2) return

    routes.push({
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `route-${index + 1}`,
      name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : `Route ${index + 1}`,
      grade: typeof candidate.grade === 'string' && candidate.grade ? candidate.grade : '6A',
      description: typeof candidate.description === 'string' ? candidate.description : undefined,
      climbType: typeof candidate.climbType === 'string' ? candidate.climbType : undefined,
      points,
      sequenceOrder: typeof candidate.sequenceOrder === 'number' ? candidate.sequenceOrder : index,
      imageWidth: typeof candidate.imageWidth === 'number' ? candidate.imageWidth : fallbackWidth,
      imageHeight: typeof candidate.imageHeight === 'number' ? candidate.imageHeight : fallbackHeight,
    })
  })

  return routes
}

function buildDraftImagesPayload(
  images: DraftImagePayload[],
  routesByImageId: Record<string, DraftRoute[]>,
  routeType: string,
  orderedManageImages?: ManageImageTab[]
): DraftSavePayload['images'] {
  const imageOrderLookup = new Map((orderedManageImages || []).map((image, index) => [image.imageId, index]))
  return images
    .slice()
    .sort((a, b) => {
      const left = imageOrderLookup.get(a.id)
      const right = imageOrderLookup.get(b.id)
      if (typeof left === 'number' && typeof right === 'number') return left - right
      if (typeof left === 'number') return -1
      if (typeof right === 'number') return 1
      return a.display_order - b.display_order
    })
    .map((image, index) => {
      const routes = routesByImageId[image.id] || []
      const completedRoutes = routes.map((route, routeIndex) => ({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climbType || routeType,
        points: route.points,
        sequenceOrder: routeIndex,
        imageWidth: route.imageWidth || image.width || 1200,
        imageHeight: route.imageHeight || image.height || 1200,
      }))

      const baseRouteData = image.route_data && typeof image.route_data === 'object'
        ? image.route_data
        : {}

      return {
        id: image.id,
        display_order: index,
        route_data: {
          ...baseRouteData,
          completedRoutes,
        },
      }
    })
}

function buildManageImageLabel(index: number, imageId: string, defaultImageId: string | null, directions?: OrientationDirection[]): string {
  const directionsLabel = Array.isArray(directions) && directions.length > 0 ? ` (${directions.join('/')})` : ''
  return imageId === defaultImageId ? `Default${directionsLabel}` : `Image ${index + 1}${directionsLabel}`
}

function resolveDraftClimbType(value: string): ClimbType {
  if (value === 'sport' || value === 'boulder' || value === 'trad' || value === 'deep-water-solo') {
    return value
  }
  return 'boulder'
}

function sortFaceDirections(directions: FaceDirection[]): FaceDirection[] {
  return [...directions].sort((a, b) => FACE_DIRECTIONS.indexOf(a) - FACE_DIRECTIONS.indexOf(b))
}

function coordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}:${longitude.toFixed(5)}`
}

function isValidLocationCoordinate(latitude: number | null | undefined, longitude: number | null | undefined): latitude is number {
  return typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0)
}

function buildHighResCanvasUrl(url: string): string {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return ''
  if (trimmedUrl.startsWith('blob:')) return trimmedUrl

  try {
    const parsedUrl = new URL(trimmedUrl, 'http://placeholder')

    // Handle media worker URLs with ?variant= query param
    const variant = parsedUrl.searchParams.get('variant')
    if (variant && variant !== 'topo' && variant !== 'full') {
      parsedUrl.searchParams.set('variant', 'topo')
      if (!parsedUrl.searchParams.has('format')) {
        parsedUrl.searchParams.set('format', 'jpeg')
      }
      return trimmedUrl.startsWith('/') ? `${parsedUrl.pathname}${parsedUrl.search}` : parsedUrl.toString()
    }
    if (variant === 'topo' || variant === 'full') {
      return trimmedUrl
    }

    // Handle legacy /thumbnail or /preview path-based variants
    const pathLower = parsedUrl.pathname.toLowerCase()
    const isLowResVariant = pathLower.includes('/thumbnail') || pathLower.includes('/preview')
    if (!isLowResVariant) {
      return trimmedUrl
    }

    const width = Number(parsedUrl.searchParams.get('w') || parsedUrl.searchParams.get('width') || '0')
    parsedUrl.searchParams.set('w', String(Math.max(width, 2048)))
    parsedUrl.searchParams.set('q', '90')
    parsedUrl.searchParams.delete('width')
    return trimmedUrl.startsWith('/') ? `${parsedUrl.pathname}${parsedUrl.search}` : parsedUrl.toString()
  } catch {
    return trimmedUrl
  }
}

function MapClickHandler({ onClick }: { onClick: (event: L.LeafletMouseEvent) => void }) {
  useMapEvents({ click: onClick })
  return null
}

function MapRecenter({ position }: { position: [number, number] | null }) {
  const map = useMapEvents({})
  useEffect(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 14))
    }
  }, [map, position])
  return null
}

function normalizePointForCompare(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function areDraftRoutesEqual(a: DraftRoute[], b: DraftRoute[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]

    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.grade !== right.grade ||
      (left.description || '') !== (right.description || '') ||
      (left.climbType || '') !== (right.climbType || '') ||
      left.sequenceOrder !== right.sequenceOrder ||
      left.imageWidth !== right.imageWidth ||
      left.imageHeight !== right.imageHeight
    ) {
      return false
    }

    if (left.points.length !== right.points.length) return false

    for (let pointIndex = 0; pointIndex < left.points.length; pointIndex += 1) {
      const leftPoint = left.points[pointIndex]
      const rightPoint = right.points[pointIndex]
      if (
        normalizePointForCompare(leftPoint.x) !== normalizePointForCompare(rightPoint.x) ||
        normalizePointForCompare(leftPoint.y) !== normalizePointForCompare(rightPoint.y)
      ) {
        return false
      }
    }
  }

  return true
}

function areRouteLinesEqual(a: RouteLine[], b: RouteLine[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.image_id !== right.image_id ||
      left.climb_id !== right.climb_id ||
      left.color !== right.color ||
      left.sequence_order !== right.sequence_order ||
      left.image_width !== right.image_width ||
      left.image_height !== right.image_height ||
      (left.climb?.id || '') !== (right.climb?.id || '') ||
      (left.climb?.name || '') !== (right.climb?.name || '') ||
      (left.climb?.grade || '') !== (right.climb?.grade || '') ||
      (left.climb?.status || '') !== (right.climb?.status || '') ||
      (left.climb?.route_type || '') !== (right.climb?.route_type || '') ||
      (left.climb?.description || '') !== (right.climb?.description || '')
    ) {
      return false
    }

    if (left.points.length !== right.points.length) return false
    for (let pointIndex = 0; pointIndex < left.points.length; pointIndex += 1) {
      const leftPoint = left.points[pointIndex]
      const rightPoint = right.points[pointIndex]
      if (
        normalizePointForCompare(leftPoint.x) !== normalizePointForCompare(rightPoint.x) ||
        normalizePointForCompare(leftPoint.y) !== normalizePointForCompare(rightPoint.y)
      ) {
        return false
      }
    }
  }

  return true
}

function buildDraftAutosaveSignature(input: {
  imagesPayloadSignature: string
  defaultImageId: string | null
  routeType: string
  markerLatitude: number | null
  markerLongitude: number | null
  cragId: string | null
  isAnonymousSubmission: boolean
  creditPlatform: string
  creditHandle: string | null
  sectorId: string | null
  canvasSource: { kind?: 'draft-image' | 'crag-image'; draftImageId?: string; cragImageId?: string; cragId?: string } | null
  orientationByImageId: Record<string, OrientationDirection[]>
  locationModeByImageId: Record<string, 'shared' | 'custom'>
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null }>
}): string {
  const imageIds = Array.from(new Set([
    ...Object.keys(input.orientationByImageId),
    ...Object.keys(input.locationModeByImageId),
    ...Object.keys(input.customGpsByImageId),
  ])).sort()

  return JSON.stringify({
    imagesPayloadSignature: input.imagesPayloadSignature,
    defaultImageId: input.defaultImageId,
    submission: {
      routeType: input.routeType,
      location: {
        latitude: input.markerLatitude,
        longitude: input.markerLongitude,
      },
      isAnonymousSubmission: input.isAnonymousSubmission,
      contributionCreditPlatform: input.creditPlatform,
      contributionCreditHandle: input.creditHandle,
      sectorId: input.sectorId,
      canvasSource: input.canvasSource?.kind === 'crag-image'
        ? {
            kind: 'crag-image',
            cragImageId: input.canvasSource.cragImageId,
            cragId: input.canvasSource.cragId,
          }
        : input.canvasSource?.kind === 'draft-image'
          ? {
              kind: 'draft-image',
              draftImageId: input.canvasSource.draftImageId,
            }
          : null,
    },
    images: imageIds.map((imageId) => ({
      imageId,
      orientation: input.orientationByImageId[imageId] || [],
      locationMode: input.locationModeByImageId[imageId] === 'custom' ? 'custom' : 'shared',
      gps: {
        latitude: input.customGpsByImageId[imageId]?.latitude ?? null,
        longitude: input.customGpsByImageId[imageId]?.longitude ?? null,
      },
    })),
    cragId: input.cragId,
  })
}

export default function EditDraftPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string

  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [, setIsRefreshingDraft] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [manageImages, setManageImages] = useState<ManageImageTab[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [defaultImageId, setDefaultImageId] = useState<string | null>(null)
  const [orientationByImageId, setOrientationByImageId] = useState<Record<string, OrientationDirection[]>>({})
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, DraftRoute[]>>({})
  const [locationModeByImageId, setLocationModeByImageId] = useState<Record<string, 'shared' | 'custom'>>({})
  const [customGpsByImageId, setCustomGpsByImageId] = useState<Record<string, { latitude: number | null; longitude: number | null }>>({})

  const [routeType, setRouteType] = useState<string>('sport')
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [isAnonymousSubmission, setIsAnonymousSubmission] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const markerPosition = useMemo<[number, number] | null>(() => {
    const parsedLatitude = Number(latitude)
    const parsedLongitude = Number(longitude)
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null
    if (parsedLatitude < -90 || parsedLatitude > 90) return null
    if (parsedLongitude < -180 || parsedLongitude > 180) return null
    if (parsedLatitude === 0 && parsedLongitude === 0) return null
    return [parsedLatitude, parsedLongitude]
  }, [latitude, longitude])
  const [cragId, setCragId] = useState<string | null>(null)
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [selectedCrag, setSelectedCrag] = useState<{
    id: string
    name: string
    latitude: number | null
    longitude: number | null
  } | null>(null)
  const [showCragSelector, setShowCragSelector] = useState(false)
  const [canvasSource, setCanvasSource] = useState<DraftCanvasSource | null>(null)
  const [cragCanvasImages, setCragCanvasImages] = useState<CragImagePayload[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [loadingCollaborators, setLoadingCollaborators] = useState(false)
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([])
  const [activeInvites, setActiveInvites] = useState<InviteItem[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)
  const [ownerProfile, setOwnerProfile] = useState<{ displayName: string; username: string | null } | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null)
  const [addingImages, setAddingImages] = useState(false)
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)
  const addImageInputRef = useRef<HTMLInputElement | null>(null)
  const publishRequirementsRef = useRef<HTMLDivElement | null>(null)
  const cragSectionRef = useRef<HTMLDivElement | null>(null)
  const locationSectionRef = useRef<HTMLDivElement | null>(null)
  const drawingAreaRef = useRef<HTMLDivElement | null>(null)
  const hasShownCollabToastRef = useRef(false)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const hasLoadedRoutesRef = useRef(false)
  const lastPersistedRoutesRef = useRef('')
  const autosavePausedRef = useRef(false)
  const autosavePausedSnapshotRef = useRef('')
  const previousActiveImageIdRef = useRef<string | null>(null)
  const lastSeededRouteImageIdRef = useRef<string | null>(null)
  const skipRouteStoreSyncRef = useRef<string | null>(null)
  const routeCanvasRef = useRef<UnifiedRouteCanvasRef>(null)
  const hasHydratedLocationRef = useRef(false)
  const lastLocationSyncRef = useRef<string | null>(null)
  const isFetchingRef = useRef(false)
  const needsRefetchRef = useRef(false)
  const draftIdRef = useRef(draftId)
  const draftRef = useRef<DraftPayload | null>(null)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'pending' | 'saving' | 'syncing' | 'saved'>('idle')
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { setMode, setInteractionTool, reset, clearCanvasState, selectedRouteId, routes: routeStoreRoutes, setRoutes: setRouteStoreRoutes, setSelectedRoute, setActiveRoute, setEditorPanelOpen, currentPoints, interactionTool, undoLastPoint } = useRouteStore()
  const { uploads, hasPendingUploads, hasFailedUploads, retryUpload, removeUpload, registerDraftUpdatedAt, queueDraftUploads, resumeQueue, isQueuePaused, subscribeToUploadComplete } = useDraftUploadManager()
  const { getUploadsForCrag } = useMediaUploadManager()
  const uploadsRef = useRef<MediaUploadItem[]>([])

  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [orientationOpen, setOrientationOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [publishedCragPins, setPublishedCragPins] = useState<PublishedCragImagePin[]>([])
  const atlasSync = useAtlasAutoSync(markerPosition?.[0] ?? null, markerPosition?.[1] ?? null)
  const markerLatitude = markerPosition?.[0] ?? null
  const markerLongitude = markerPosition?.[1] ?? null
  const atlasCountryId = atlasSync.atlas?.countryId ?? null
  const atlasCountryCode = atlasSync.atlas?.countryCode ?? null
  const atlasCountryName = atlasSync.atlas?.countryName ?? null
  const atlasAdminRegionName = atlasSync.atlas?.adminRegionName ?? null
  const atlasUnRegionName = atlasSync.atlas?.unRegionName ?? null
  const atlasContinentName = atlasSync.atlas?.continentName ?? null
  const nearbyCragId = atlasSync.nearbyCrag?.id ?? null
  const nearbyCragName = atlasSync.nearbyCrag?.name ?? null
  const imagesPayload = useMemo(() => {
    if (!draft) return []
    return buildDraftImagesPayload(draft.images, routesByImageId, routeType, manageImages)
  }, [draft, manageImages, routeType, routesByImageId])
  const imagesPayloadSignature = useMemo(() => JSON.stringify(imagesPayload), [imagesPayload])
  const autosaveSignature = useMemo(() => buildDraftAutosaveSignature({
    imagesPayloadSignature,
    defaultImageId,
    routeType,
    markerLatitude,
    markerLongitude,
    cragId,
    isAnonymousSubmission,
    creditPlatform,
    creditHandle,
    sectorId,
    canvasSource,
    orientationByImageId,
    locationModeByImageId,
    customGpsByImageId,
  }), [canvasSource, creditHandle, creditPlatform, cragId, customGpsByImageId, defaultImageId, imagesPayloadSignature, isAnonymousSubmission, locationModeByImageId, markerLatitude, markerLongitude, orientationByImageId, routeType, sectorId])

  const loadDraft = useCallback(async () => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId) return

    const isFirstLoad = !draftRef.current
    if (isFirstLoad) {
      setIsInitialLoading(true)
    } else {
      setIsRefreshingDraft(true)
    }
    setError(null)
    try {
      const response = await fetch(`/api/submissions/drafts/${currentDraftId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({} as { draft?: DraftPayload; isOwner?: boolean; error?: string }))
      if (!response.ok || !payload?.draft) {
        throw new Error(payload.error || 'Failed to load draft')
      }

      const nextDraft = payload.draft
      const allDraftImages = [...(nextDraft.images || [])]
        .sort((a, b) => a.display_order - b.display_order)
      const persistedImages = allDraftImages.filter((image) => image.id && typeof image.id === 'string')
      const sortedImages = persistedImages.filter((image) => isDraftImageReady(image))
      const hasPersistedImageRows = allDraftImages.length > 0
      const hasProcessingPersistedImages = allDraftImages.some((image) => image.readiness_status === 'processing')
      const hasErroredPersistedImages = hasPersistedImageRows && allDraftImages.every((image) => image.readiness_status === 'error')
      const hasPendingDraftUploadRows = currentDraftId
        ? uploadsRef.current.some((upload) => upload.target.kind === 'draft' && upload.target.draftId === currentDraftId)
        : false

      const metadata = nextDraft.metadata && typeof nextDraft.metadata === 'object' ? nextDraft.metadata : {}
      const normalizedMetadata = normalizeDraftMetadata(metadata, persistedImages)
      const canvasMetadata = metadata as Record<string, unknown> as CanvasSourceMetadata
      const nextDefaultImageId = normalizedMetadata.navigation.defaultImageId || persistedImages[0]?.id || null
      const nextOrientationByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, OrientationDirection[]>>((acc, image) => {
        if (Array.isArray(image.orientation) && image.orientation.length > 0) {
          acc[image.imageId] = image.orientation
        }
        return acc
      }, {})
      const nextLocationModeByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, 'shared' | 'custom'>>((acc, image) => {
        acc[image.imageId] = image.locationMode === 'custom' ? 'custom' : 'shared'
        return acc
      }, {})
      const nextCustomGpsByImageId = Object.values(normalizedMetadata.images).reduce<Record<string, { latitude: number | null; longitude: number | null }>>((acc, image) => {
        acc[image.imageId] = {
          latitude: typeof image.gps?.latitude === 'number' ? image.gps.latitude : null,
          longitude: typeof image.gps?.longitude === 'number' ? image.gps.longitude : null,
        }
        return acc
      }, {})

      const nextRoutesByImageId: Record<string, DraftRoute[]> = {}
      persistedImages.forEach((image) => {
        nextRoutesByImageId[image.id] = parseRoutesFromRouteData(image.route_data, image.width || 1200, image.height || 1200)
      })
      const nextManageImages = sortedImages.map<ManageImageTab>((image, index) => {
        const directions = nextOrientationByImageId[image.id]
        return {
          imageId: image.id,
          sourceKind: 'draft-image',
          index,
          label: buildManageImageLabel(index, image.id, nextDefaultImageId, directions),
          signedUrl: image.proxy_url || '',
          latitude: typeof image.latitude === 'number' ? image.latitude : null,
          longitude: typeof image.longitude === 'number' ? image.longitude : null,
          locationMode: nextLocationModeByImageId[image.id] || 'shared',
        }
      })

      const normalizedRouteType = typeof normalizedMetadata.submission.routeType === 'string' && normalizedMetadata.submission.routeType
        ? normalizedMetadata.submission.routeType
        : 'sport'

      const normalizedCreditPlatform = normalizeSubmissionCreditPlatform((metadata as { contributionCreditPlatform?: unknown }).contributionCreditPlatform)
      const normalizedCreditHandle = typeof (metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle === 'string'
        ? String((metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle)
        : ''
      const normalizedAnonymousSubmission = normalizedMetadata.submission.isAnonymousSubmission
      const metadataLocation = normalizedMetadata.submission.location
      const metadataLatitude = metadataLocation && typeof metadataLocation === 'object' && typeof (metadataLocation as { latitude?: unknown }).latitude === 'number'
        ? (metadataLocation as { latitude: number }).latitude
        : null
      const metadataLongitude = metadataLocation && typeof metadataLocation === 'object' && typeof (metadataLocation as { longitude?: unknown }).longitude === 'number'
        ? (metadataLocation as { longitude: number }).longitude
        : null

      const cragRelation = Array.isArray(nextDraft.crags) ? nextDraft.crags[0] : nextDraft.crags
      const nextCrag = nextDraft.crag_id
        ? {
            id: nextDraft.crag_id,
            name: cragRelation?.name || 'Selected crag',
            latitude: typeof cragRelation?.latitude === 'number' ? cragRelation.latitude : 0,
            longitude: typeof cragRelation?.longitude === 'number' ? cragRelation.longitude : 0,
          }
        : null

      setDraft(nextDraft)
      setDraftUpdatedAt(nextDraft.updated_at)
      registerDraftUpdatedAt(nextDraft.id, nextDraft.updated_at)
      setConflict(null)
      setManageImages(nextManageImages)
      setDefaultImageId(nextDefaultImageId)
      setActiveImageId((current) => {
        if (current && sortedImages.some((image) => image.id === current)) return current
        if (nextDefaultImageId) return nextDefaultImageId
        return current
      })
      setOrientationByImageId(nextOrientationByImageId)
      setLocationModeByImageId(nextLocationModeByImageId)
      setCustomGpsByImageId(nextCustomGpsByImageId)
      setRoutesByImageId(nextRoutesByImageId)
      hasLoadedRoutesRef.current = true
      const savedCanvasSource = canvasMetadata.submission?.canvasSource
      lastPersistedRoutesRef.current = buildDraftAutosaveSignature({
        imagesPayloadSignature: JSON.stringify(buildDraftImagesPayload(nextDraft.images, nextRoutesByImageId, normalizedRouteType, nextManageImages)),
        defaultImageId: nextDefaultImageId,
        routeType: normalizedRouteType,
        markerLatitude: typeof metadataLatitude === 'number' ? metadataLatitude : null,
        markerLongitude: typeof metadataLongitude === 'number' ? metadataLongitude : null,
        cragId: nextDraft.crag_id,
        isAnonymousSubmission: normalizedAnonymousSubmission,
        creditPlatform: normalizedCreditPlatform || 'instagram',
        creditHandle: normalizedCreditHandle,
        sectorId,
        canvasSource: savedCanvasSource?.kind === 'crag-image'
          ? {
              kind: 'crag-image',
              cragImageId: savedCanvasSource.cragImageId,
              cragId: savedCanvasSource.cragId,
            }
          : savedCanvasSource?.kind === 'draft-image'
            ? {
                kind: 'draft-image',
                draftImageId: savedCanvasSource.draftImageId,
              }
            : null,
        orientationByImageId: nextOrientationByImageId,
        locationModeByImageId: nextLocationModeByImageId,
        customGpsByImageId: nextCustomGpsByImageId,
      })
      autosavePausedRef.current = false
      autosavePausedSnapshotRef.current = ''
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
      setAutosaveState('idle')
      setRouteType(normalizedRouteType)
      setCreditPlatform(normalizedCreditPlatform || 'instagram')
      setCreditHandle(normalizedCreditHandle)
      setIsAnonymousSubmission(normalizedAnonymousSubmission)
      setLatitude(typeof metadataLatitude === 'number' ? metadataLatitude.toString() : '')
      setLongitude(typeof metadataLongitude === 'number' ? metadataLongitude.toString() : '')
      setCragId(nextDraft.crag_id)
      setSelectedCrag(nextCrag)
      setShowCragSelector(!nextDraft.crag_id)
      if (savedCanvasSource?.kind === 'crag-image' && typeof savedCanvasSource.cragImageId === 'string' && typeof savedCanvasSource.cragId === 'string') {
        setCanvasSource({ kind: 'crag-image', cragImageId: savedCanvasSource.cragImageId, cragId: savedCanvasSource.cragId })
        setActiveImageId(savedCanvasSource.cragImageId)
      } else if (nextDefaultImageId) {
        setCanvasSource({ kind: 'draft-image', draftImageId: nextDefaultImageId })
      }
      hasHydratedLocationRef.current = false
      const metadataLocationContext = normalizedMetadata.submission.location ?? null
      lastLocationSyncRef.current = JSON.stringify({
        latitude: typeof metadataLatitude === 'number' ? metadataLatitude : null,
        longitude: typeof metadataLongitude === 'number' ? metadataLongitude : null,
        countryId: metadataLocationContext?.countryId ?? null,
        countryCode: metadataLocationContext?.countryCode ?? null,
        countryName: metadataLocationContext?.countryName ?? null,
        adminRegionName: metadataLocationContext?.adminRegionName ?? null,
        unRegionName: metadataLocationContext?.unRegionName ?? null,
        continentName: metadataLocationContext?.continentName ?? null,
        cragId: nextDraft.crag_id,
      })
      if (typeof payload.isOwner === 'boolean') {
        setIsOwner(payload.isOwner)
      }

      if (hasErroredPersistedImages && !hasPendingDraftUploadRows) {
        setError('Some photos failed to prepare for the editor. Try re-uploading the affected images.')
      } else if ((hasProcessingPersistedImages && sortedImages.length === 0) || hasPendingDraftUploadRows) {
        setError(null)
      }
    } catch (loadError) {
      if (loadError instanceof DOMException ? loadError.name === 'AbortError' : loadError instanceof Error && loadError.name === 'AbortError') {
        return
      }
      const message = loadError instanceof Error ? loadError.message : 'Failed to load draft'
      setError(message)
    } finally {
      if (isFirstLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshingDraft(false)
      }
    }
  }, [registerDraftUpdatedAt, sectorId])

  const syncUploadedImages = useCallback(async () => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId || !draft) return

    try {
      await loadDraft()
    } catch (error) {
      uploadDebug('sync-uploaded-images-failed', { draftId: currentDraftId, error: String(error) })
    }
  }, [draft, loadDraft])

  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  useEffect(() => {
    if (!cragId) {
      setPublishedCragPins([])
      setCragCanvasImages([])
      return
    }

    let cancelled = false

    async function loadPublishedCragPins() {
      try {
        const response = await fetch(`/api/crags/${cragId}/images`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({} as { images?: Array<{ id?: string; display_image_id?: string; linked_image_id?: string | null; signed_url?: string | null; width?: number | null; height?: number | null; latitude?: number | null; longitude?: number | null }> }))
        if (!response.ok || !Array.isArray(payload.images)) {
          if (!cancelled) setPublishedCragPins([])
          return
        }

        if (!cancelled) {
          const imageItems = payload.images as Array<{ id?: string; display_image_id?: string; linked_image_id?: string | null; signed_url?: string | null; width?: number | null; height?: number | null; latitude?: number | null; longitude?: number | null }>
          const nextCragImages: CragImagePayload[] = imageItems.map((image) => ({
            id: typeof image.id === 'string' ? image.id : '',
            signed_url: typeof image.signed_url === 'string' ? image.signed_url : null,
            linked_image_id: typeof image.linked_image_id === 'string' ? image.linked_image_id : null,
            display_image_id: typeof image.display_image_id === 'string' ? image.display_image_id : null,
            width: typeof image.width === 'number' ? image.width : null,
            height: typeof image.height === 'number' ? image.height : null,
            latitude: typeof image.latitude === 'number' ? image.latitude : null,
            longitude: typeof image.longitude === 'number' ? image.longitude : null,
          })).filter((image) => Boolean(image.id))
          setCragCanvasImages(nextCragImages)
        }

        const nextPins = payload.images
          .map((image: { id?: string; display_image_id?: string; latitude?: number | null; longitude?: number | null }) => {
            const latitude = typeof image.latitude === 'number' ? image.latitude : null
            const longitude = typeof image.longitude === 'number' ? image.longitude : null
            const id = typeof image.display_image_id === 'string' && image.display_image_id
              ? image.display_image_id
              : typeof image.id === 'string'
                ? image.id
                : null
            if (!id || latitude === null || longitude === null) return null
            return { id, latitude, longitude }
          })
          .filter((image: PublishedCragImagePin | null): image is PublishedCragImagePin => image !== null)

        if (!cancelled) {
          setPublishedCragPins(nextPins)
        }
      } catch {
        if (!cancelled) setPublishedCragPins([])
      }
    }

    void loadPublishedCragPins()

    return () => {
      cancelled = true
    }
  }, [cragId])

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }: UserResponse) => {
      setCurrentUserId(data.user?.id || null)
    })
  }, [])

  useEffect(() => {
    import('leaflet').then((lib) => setLeaflet(lib))
  }, [])

  const loadCollaborators = useCallback(async () => {
    if (!draftId) return

    setLoadingCollaborators(true)
    try {
      const response = await fetch(`/api/submissions/drafts/${draftId}/collaborators`, { cache: 'no-store' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error || 'Failed to load draft collaborators')
      }

      const data = await response.json() as {
        owner: {
          userId: string
          profile: {
            displayName: string
            username: string | null
          }
        } | null
        collaborators: CollaboratorItem[]
        isOwner: boolean
        activeInvites?: InviteItem[]
      }

      setOwnerUserId(data.owner?.userId || null)
      setOwnerProfile(data.owner?.profile || null)
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : [])
      setIsOwner(Boolean(data.isOwner))
      setActiveInvites(Array.isArray(data.activeInvites) ? data.activeInvites : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft collaborators')
    } finally {
      setLoadingCollaborators(false)
    }
  }, [draftId])

  useEffect(() => {
    void loadCollaborators()
  }, [loadCollaborators])

  const collaborationAdded = searchParams.get('collab') === 'added'

  useEffect(() => {
    if (!collaborationAdded || hasShownCollabToastRef.current) return
    addToast('You were added as a draft collaborator', 'success')
    hasShownCollabToastRef.current = true
  }, [collaborationAdded, addToast])

  const pendingDraftUploads = useMemo(() => draftId ? uploads.filter((upload: MediaUploadItem) => upload.target.kind === 'draft' && upload.target.draftId === draftId) : [], [draftId, uploads])

  const queuePaused = useMemo(() => isQueuePaused(draftId || undefined), [draftId, isQueuePaused])
  const pendingCragUploads = useMemo(() => cragId ? getUploadsForCrag(cragId) : [], [cragId, getUploadsForCrag])

  const mergedCragCanvasImages = useMemo(() => {
    const persisted = cragCanvasImages
      .filter((image) => image.signed_url)
      .map<ManageImageTab>((image, index) => ({
        imageId: image.id,
        sourceKind: 'crag-image' as const,
        index,
        label: `Crag image ${index + 1}`,
        signedUrl: image.signed_url || '',
        latitude: typeof image.latitude === 'number' ? image.latitude : null,
        longitude: typeof image.longitude === 'number' ? image.longitude : null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    // Optimistic entries: crag uploads that just succeeded but haven't appeared in persisted yet
    const optimistic = pendingCragUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !cragCanvasImages.some((img) => img.id === upload.attachedRecordId))
      .map<ManageImageTab>((upload) => ({
        imageId: upload.attachedRecordId!,
        sourceKind: 'crag-image' as const,
        index: persisted.length,
        label: 'Crag image (syncing...)',
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pending = pendingCragUploads
      .filter((upload) => !upload.attachedRecordId)
      .map<ManageImageTab>((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'crag-image' as const,
        index: persisted.length + optimistic.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...persisted, ...optimistic, ...pending]
  }, [cragCanvasImages, pendingCragUploads])

  const mergedManageImages = useMemo(() => {
    // Optimistic entries: uploads that just succeeded but haven't appeared in manageImages yet
    const optimisticTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => upload.status === 'SUCCESS' && upload.attachedRecordId && upload.uploadedPath)
      .filter((upload) => !manageImages.some((img) => img.imageId === upload.attachedRecordId))
      .map((upload) => ({
        imageId: upload.attachedRecordId!,
        sourceKind: 'draft-image' as const,
        index: manageImages.length,
        label: 'Image (syncing...)',
        signedUrl: upload.previewUrl || `/api/media/private?draftId=${draftId}&path=${encodeURIComponent(upload.uploadedPath!)}`,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: undefined,
        error: null,
        pendingClientId: null,
      }))

    const pendingTabs: ManageImageTab[] = pendingDraftUploads
      .filter((upload) => !upload.attachedRecordId)
      .map((upload, index) => ({
        imageId: upload.clientId,
        sourceKind: 'draft-image' as const,
        index: manageImages.length + optimisticTabs.length + index,
        label: upload.status === 'FAILED'
          ? `Failed: ${upload.fileName}`
          : upload.status === 'UPLOADING'
            ? `Uploading ${upload.progress}%: ${upload.fileName}`
            : upload.status === 'PREPROCESSING'
              ? `Preparing: ${upload.fileName}`
              : `Waiting: ${upload.fileName}`,
        signedUrl: upload.previewUrl,
        latitude: upload.gpsData?.latitude ?? null,
        longitude: upload.gpsData?.longitude ?? null,
        status: upload.status,
        error: upload.error,
        pendingClientId: upload.clientId,
      }))

    return [...manageImages, ...optimisticTabs, ...pendingTabs].sort((a, b) => a.index - b.index)
  }, [draftId, manageImages, pendingDraftUploads])

  const stableCanvasUrlRef = useRef<{ imageId: string | null; imageUrl: string }>({ imageId: null, imageUrl: '' })

  const hasInFlightDraftUploads = useMemo(() => {
    return pendingDraftUploads.some((upload) => (
      upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING'
    ))
  }, [pendingDraftUploads])

  useEffect(() => {
    if (!draftId) return
    const handleUploadComplete: UploadCompleteCallback = (_target, _clientId, attachedRecordId, newUpdatedAt) => {
      if (newUpdatedAt) {
        setDraftUpdatedAt(newUpdatedAt)
        registerDraftUpdatedAt(draftId, newUpdatedAt)
      }
      if (attachedRecordId) {
        setActiveImageId((current) => current || attachedRecordId)
        setDefaultImageId((current) => current || attachedRecordId)
      }
      if (isFetchingRef.current) {
        needsRefetchRef.current = true
        return
      }
      isFetchingRef.current = true
      needsRefetchRef.current = false
      void syncUploadedImages().finally(() => {
        isFetchingRef.current = false
        if (needsRefetchRef.current) {
          needsRefetchRef.current = false
          void syncUploadedImages()
        }
      })
    }
    return subscribeToUploadComplete(handleUploadComplete)
  }, [draftId, registerDraftUpdatedAt, subscribeToUploadComplete, syncUploadedImages])

  // Polling fallback: periodically refetch when draft has images still processing.
  // This catches cases where subscriber events are missed or the worker completes
  // after all upload callbacks have fired.
  const hasProcessingImages = useMemo(() => {
    if (!draft) return false
    return draft.images.some((image) => image.readiness_status === 'processing')
  }, [draft])

  useEffect(() => {
    if (!hasProcessingImages || !draftId) return
    // Only poll when no uploads are actively firing subscriber callbacks
    const hasActiveUploads = pendingDraftUploads.some(
      (upload) => upload.status === 'QUEUED' || upload.status === 'PREPROCESSING' || upload.status === 'UPLOADING'
    )
    if (hasActiveUploads) return

    const timer = window.setInterval(() => {
      void loadDraft()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [hasProcessingImages, draftId, pendingDraftUploads, loadDraft])

  useEffect(() => {
    if (!cragId || activeImageId || canvasSource?.kind === 'draft-image') return
    const firstReadyCragImage = cragCanvasImages.find((image) => image.signed_url) || null
    if (!firstReadyCragImage?.id) return
    setActiveImageId(firstReadyCragImage.id)
    setCanvasSource({ kind: 'crag-image', cragImageId: firstReadyCragImage.id, cragId })
  }, [activeImageId, canvasSource, cragCanvasImages, cragId])

  const activeImageTab = useMemo(() => {
    if (!activeImageId) return null
    const sourceImages = canvasSource?.kind === 'crag-image' ? mergedCragCanvasImages : mergedManageImages
    return sourceImages.find((image) => image.imageId === activeImageId) || null
  }, [activeImageId, canvasSource, mergedCragCanvasImages, mergedManageImages])
  const activeDraftImageId = activeImageTab?.imageId || null
  const activeImageLocationMode = activeDraftImageId ? (resolveLocationMode(locationModeByImageId[activeDraftImageId])) : 'shared'

  const activeRoutes = useMemo(() => {
    if (!activeDraftImageId) return []
    return routesByImageId[activeDraftImageId] || []
  }, [activeDraftImageId, routesByImageId])

  const existingRouteLines = useMemo(() => {
    return activeRoutes.map((route) => ({
      id: route.id,
      image_id: activeDraftImageId || 'draft-image',
      climb_id: route.id,
      points: route.points,
      color: 'red',
      sequence_order: route.sequenceOrder,
      image_width: route.imageWidth,
      image_height: route.imageHeight,
      created_at: 'draft-hydrated',
      climb: {
        id: route.id,
        name: route.name,
        grade: route.grade,
        status: 'draft',
        route_type: route.climbType || routeType,
        description: route.description || null,
      },
    } as RouteLine))
  }, [activeRoutes, activeDraftImageId, routeType])

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

  const stableActiveImageUrl = useMemo(() => {
    if (!imageSelection || !('imageUrl' in imageSelection)) {
      stableCanvasUrlRef.current = { imageId: null, imageUrl: '' }
      return ''
    }

    const nextImageId = imageSelection.mode === 'crag-image'
      ? imageSelection.cragImageId
      : imageSelection.imageId

    if (stableCanvasUrlRef.current.imageId === nextImageId && stableCanvasUrlRef.current.imageUrl === imageSelection.imageUrl) {
      return stableCanvasUrlRef.current.imageUrl
    }

    stableCanvasUrlRef.current = {
      imageId: nextImageId,
      imageUrl: imageSelection.imageUrl,
    }
    return imageSelection.imageUrl
  }, [imageSelection])

  useEffect(() => {
    if (!imageSelection || !('imageUrl' in imageSelection)) return
    uploadDebug('editor-active-image-url', {
      activeImageId,
      imageUrl: imageSelection.imageUrl,
      sourceKind: activeImageTab?.sourceKind || null,
      status: activeImageTab?.status || null,
    })
  }, [activeImageId, activeImageTab?.sourceKind, activeImageTab?.status, imageSelection])

  const activeImageReady = Boolean(activeImageTab?.signedUrl) && activeImageTab?.status !== 'FAILED'

  const hasValidLocation = markerPosition !== null
  const defaultImageTab = useMemo(() => {
    if (!defaultImageId) return null
    return mergedManageImages.find((image) => image.imageId === defaultImageId) || null
  }, [defaultImageId, mergedManageImages])
  const defaultImageRoutes = useMemo(() => {
    if (!defaultImageId) return []
    return routesByImageId[defaultImageId] || []
  }, [defaultImageId, routesByImageId])

  const publishValidationMessage = useMemo(() => {
    const missingItems: string[] = []

    if (draftId && hasPendingUploads(draftId)) {
      missingItems.push('wait for photo uploads to finish')
    }

    if (draftId && hasFailedUploads(draftId)) {
      missingItems.push('retry or delete failed photo uploads')
    }

    if (!cragId) {
      missingItems.push('select a crag')
    }

    if (!hasValidLocation) {
      missingItems.push('add climb location')
    }

    if (!defaultImageTab || defaultImageRoutes.length === 0) {
      missingItems.push(`draw at least one route on ${defaultImageTab?.label || 'the default image'}`)
    }

    return missingItems.length > 0
      ? `Before publishing, ${missingItems.join(', ')}.`
      : null
  }, [cragId, defaultImageRoutes.length, defaultImageTab, draftId, hasFailedUploads, hasPendingUploads, hasValidLocation])

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
      return {
        ...pin,
        tone: sourceImage?.sourceKind === 'crag-image' ? 'published' : 'draft',
      }
    })
  }, [quickSwitcherImages])

  const activeImageCustomPosition = useMemo<[number, number] | null>(() => {
    if (!activeDraftImageId || activeImageLocationMode !== 'custom') return null
    const gps = customGpsByImageId[activeDraftImageId]
    if (!gps || !isValidLocationCoordinate(gps.latitude, gps.longitude)) return null
    return [gps.latitude as number, gps.longitude as number]
  }, [activeDraftImageId, activeImageLocationMode, customGpsByImageId])

  const effectiveMarkerPosition = activeImageCustomPosition || markerPosition

  const fallbackLocation = useMemo<[number, number] | null>(() => {
    const firstImagePin = draftMapPins.find((pin) => isValidLocationCoordinate(pin.latitude, pin.longitude)) || null
    if (firstImagePin) {
      return [firstImagePin.latitude, firstImagePin.longitude as number]
    }

    if (selectedCrag && isValidLocationCoordinate(selectedCrag.latitude, selectedCrag.longitude)) {
      return [selectedCrag.latitude, selectedCrag.longitude as number]
    }

    return null
  }, [draftMapPins, selectedCrag])

  const publishedMapPins = useMemo<LightweightCragMapPin[]>(() => {
    const draftCoordinateKeys = new Set(
      quickSwitcherImages
        .filter((image: ManageImageTab & { badgeNumber: number; isDefault: boolean }) => typeof image.latitude === 'number' && typeof image.longitude === 'number')
        .map((image: ManageImageTab & { badgeNumber: number; isDefault: boolean }) => coordinateKey(image.latitude as number, image.longitude as number))
    )
    const seenPublishedCoordinates = new Set<string>()

    return publishedCragPins.reduce<LightweightCragMapPin[]>((acc, image) => {
      const key = coordinateKey(image.latitude, image.longitude)
      if (draftCoordinateKeys.has(key) || seenPublishedCoordinates.has(key)) return acc
      seenPublishedCoordinates.add(key)
      acc.push({
        id: `published-${image.id}`,
        latitude: image.latitude,
        longitude: image.longitude,
        interactive: false,
        tone: 'published',
      })
      return acc
    }, [])
  }, [publishedCragPins, quickSwitcherImages])

  useEffect(() => {
    if (!activeImageId) return
    const activeQuickSwitchImage = quickSwitcherImages.find((image) => image.imageId === activeImageId) || null
      const latitude = activeImageCustomPosition?.[0] ?? activeQuickSwitchImage?.latitude ?? null
      const longitude = activeImageCustomPosition?.[1] ?? activeQuickSwitchImage?.longitude ?? null
    if (latitude === null && longitude === null) return
    uploadDebug('editor-active-image-map-data', {
      activeImageId,
      hasQuickSwitchImage: Boolean(activeQuickSwitchImage),
      latitude,
      longitude,
    })
  }, [activeImageCustomPosition, activeImageId, quickSwitcherImages])

  useEffect(() => {
    setMode('edit-existing')
    setInteractionTool('draw')
    return () => {
      reset()
    }
  }, [setMode, setInteractionTool, reset])

  useEffect(() => {
    const previousActiveImageId = previousActiveImageIdRef.current

    if (previousActiveImageId && activeImageId && previousActiveImageId !== activeImageId) {
      clearCanvasState()
    }

    previousActiveImageIdRef.current = activeImageId
  }, [activeImageId, clearCanvasState])

  useEffect(() => {
    if (!draft || isInitialLoading) return
    hasHydratedLocationRef.current = true
  }, [draft, isInitialLoading])

  useEffect(() => {
    if (!hasHydratedLocationRef.current) return
    if (effectiveMarkerPosition || !fallbackLocation) return

    setLatitude(fallbackLocation[0].toFixed(6))
    setLongitude(fallbackLocation[1].toFixed(6))
  }, [effectiveMarkerPosition, fallbackLocation])

  useEffect(() => {
    if (!hasHydratedLocationRef.current || !draftId || !draftUpdatedAt || !markerPosition || imagesPayload.length === 0) return

    const latitudeValue = markerLatitude
    const longitudeValue = markerLongitude
    const nextCragId = cragId ?? nearbyCragId
    const signature = JSON.stringify({
      latitude: latitudeValue,
      longitude: longitudeValue,
      countryId: atlasCountryId,
      countryCode: atlasCountryCode,
      countryName: atlasCountryName,
      adminRegionName: atlasAdminRegionName,
      unRegionName: atlasUnRegionName,
      continentName: atlasContinentName,
      cragId: nextCragId,
    })

    if (signature === lastLocationSyncRef.current) return

    const timer = window.setTimeout(async () => {
      lastLocationSyncRef.current = signature
      const atlasForPatch = atlasSync.atlas

      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: draftUpdatedAt,
          images: imagesPayload,
          metadata: {
            submission: {
              routeType,
              isAnonymousSubmission,
              contributionCreditPlatform: creditPlatform,
              contributionCreditHandle: creditHandle,
              location: {
                latitude: latitudeValue,
                longitude: longitudeValue,
                countryId: atlasForPatch?.countryId ?? null,
                countryCode: atlasForPatch?.countryCode ?? null,
                countryName: atlasForPatch?.countryName ?? null,
                adminRegionName: atlasForPatch?.adminRegionName ?? null,
                unRegionName: atlasForPatch?.unRegionName ?? null,
                continentName: atlasForPatch?.continentName ?? null,
              },
            },
          },
          cragId: nextCragId,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload?.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      } else {
        lastLocationSyncRef.current = null
      }
      if (!cragId && nearbyCragId) {
        setCragId(nearbyCragId)
        setSelectedCrag((current) => current || {
          id: nearbyCragId,
          name: nearbyCragName || 'Suggested crag',
          latitude: latitudeValue ?? 0,
          longitude: longitudeValue ?? 0,
        })
      }
    }, 400)

    return () => window.clearTimeout(timer)
  // draftUpdatedAt and atlasSync.atlas are intentionally read at execution time
  // to avoid retriggering this sync effect after a successful PATCH.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasAdminRegionName, atlasContinentName, atlasCountryCode, atlasCountryId, atlasCountryName, atlasUnRegionName, cragId, draft, draftId, imagesPayload.length, imagesPayloadSignature, isInitialLoading, markerLatitude, markerLongitude, markerPosition, nearbyCragId, nearbyCragName])

  const toggleImageOrientation = useCallback((direction: FaceDirection) => {
    if (!activeDraftImageId) return
    setOrientationByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const next = current.includes(direction)
        ? current.filter((value) => value !== direction)
        : [...current, direction]
      return {
        ...prev,
        [activeDraftImageId]: sortFaceDirections(next),
      }
    })
  }, [activeDraftImageId])

  const focusDrawingArea = useCallback((behavior: ScrollBehavior = 'smooth') => {
    drawingAreaRef.current?.scrollIntoView({ behavior, block: 'start' })
  }, [])

  const handleQuickSwitchImage = useCallback((imageId: string) => {
    const targetImage = quickSwitcherImages.find((image) => image.imageId === imageId) || null
    setActiveImageId(imageId)
    if (targetImage?.sourceKind === 'crag-image' && cragId) {
      setCanvasSource({ kind: 'crag-image', cragImageId: imageId, cragId })
    } else {
      setCanvasSource({ kind: 'draft-image', draftImageId: imageId })
    }
    window.setTimeout(() => {
      focusDrawingArea('smooth')
    }, 0)
  }, [cragId, focusDrawingArea, quickSwitcherImages])

  const handleAddImages = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !draftId || !draftUpdatedAt || addingImages) return

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
      .slice(0, 20)
    if (files.length === 0) {
      setError('Select at least one image file')
      return
    }

    setAddingImages(true)
    setError(null)
    setSuccess(null)

    try {
      queueDraftUploads(files, draftId)
      setSuccess(`Added ${files.length} image${files.length === 1 ? '' : 's'} to draft`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add images')
    } finally {
      setAddingImages(false)
      if (addImageInputRef.current) {
        addImageInputRef.current.value = ''
      }
    }
  }, [addingImages, draftId, draftUpdatedAt, queueDraftUploads])

  const handleQuickBarDropFiles = useCallback((files: File[]) => {
    const fileListLike: { length: number; item: (index: number) => File | null; [key: number]: File } = {
      length: files.length,
      item: (index: number) => files[index] || null,
    }
    files.forEach((file, index) => {
      fileListLike[index] = file
    })
    void handleAddImages(fileListLike as unknown as FileList)
  }, [handleAddImages])

  const handleRemoveImage = useCallback(async (imageId: string) => {
    const pendingUpload = pendingDraftUploads.find((upload) => upload.clientId === imageId) || null
    if (pendingUpload) {
      setError(null)
      setSuccess(null)
      await removeUpload(pendingUpload.clientId)
      if (activeImageId === pendingUpload.clientId) {
        const fallbackImageId = mergedManageImages.find((image) => image.imageId !== pendingUpload.clientId)?.imageId || null
        setActiveImageId(fallbackImageId)
      }
      setSuccess('Image removed from draft')
      return
    }

    if (!draft || !draftUpdatedAt || removingImageId) return
    if (draft.images.length <= 1) {
      setError('A draft must keep at least one image')
      return
    }

    setRemovingImageId(imageId)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/images/${imageId}?expected_updated_at=${encodeURIComponent(draftUpdatedAt)}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({} as DraftDeleteImageResponse & DraftConflictResponse & { error?: string }))

      if (!response.ok) {
        if (response.status === 409 && (payload as DraftConflictResponse).code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          setConflict({
            serverUpdatedAt: conflictPayload.current_updated_at,
            lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: {
              images: [],
              metadata: {},
              cragId,
            },
          })
          return
        }

        throw new Error((payload as { error?: string }).error || 'Failed to remove image')
      }

      const remainingImages = draft.images
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .filter((image) => image.id !== imageId)
      const fallbackImageId = remainingImages[0]?.id || null

      if (defaultImageId === imageId) {
        setDefaultImageId(fallbackImageId)
      }

      if (activeImageId === imageId) {
        setActiveImageId(defaultImageId && defaultImageId !== imageId ? defaultImageId : fallbackImageId)
      }

      setOrientationByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })
      setRoutesByImageId((prev) => {
        const next = { ...prev }
        delete next[imageId]
        return next
      })

      await loadDraft()
      if (payload.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      }
      setSuccess('Image removed from draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setRemovingImageId(null)
    }
  }, [activeImageId, cragId, defaultImageId, draft, draftUpdatedAt, loadDraft, mergedManageImages, pendingDraftUploads, removeUpload, removingImageId])

  const handleCreateInvite = useCallback(async () => {
    if (!draftId || creatingInvite || !isOwner) return

    setCreatingInvite(true)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: null, expiresAt: null }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error || 'Failed to create draft invite link')
      }

      const data = await response.json() as { invite?: { inviteUrl?: string } }
      const inviteUrl = data.invite?.inviteUrl || null
      setLatestInviteUrl(inviteUrl)
      setSuccess('Invite link created')
      await loadCollaborators()

      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        addToast('Invite link copied', 'success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create draft invite link')
    } finally {
      setCreatingInvite(false)
    }
  }, [draftId, creatingInvite, isOwner, loadCollaborators, addToast])

  const handleCopyInvite = useCallback(async (inviteUrl: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setSuccess('Invite link copied')
      addToast('Invite link copied', 'success')
    } catch {
      setError('Failed to copy invite link')
      addToast('Failed to copy invite link', 'error')
    }
  }, [addToast])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!draftId || !isOwner || revokingInviteId) return

    setRevokingInviteId(inviteId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error || 'Failed to revoke invite')
      }

      setSuccess('Invite revoked')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }, [draftId, isOwner, revokingInviteId, loadCollaborators])

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: string) => {
    if (!draftId || removingCollaboratorId) return

    setRemovingCollaboratorId(collaboratorUserId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/collaborators/${collaboratorUserId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(data.error || 'Failed to remove collaborator')
      }

      if (currentUserId && collaboratorUserId === currentUserId && !isOwner) {
        addToast('You left this draft', 'success')
        router.push('/logbook')
        return
      }

      setSuccess('Collaborator removed')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [draftId, removingCollaboratorId, currentUserId, isOwner, addToast, router, loadCollaborators])

  const handleDeleteDraft = useCallback(async () => {
    if (!draftId || !isOwner) return

    setError(null)
    const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({} as { error?: string }))
    if (!response.ok) {
      setError(payload.error || 'Failed to delete draft')
      return
    }

    addToast('Draft deleted', 'success')
    router.push('/logbook')
  }, [draftId, isOwner, addToast, router])

  const updateDraftLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    if (activeDraftImageId && activeImageLocationMode === 'custom') {
      setCustomGpsByImageId((prev) => ({
        ...prev,
        [activeDraftImageId]: {
          latitude: nextLatitude,
          longitude: nextLongitude,
        },
      }))
      return
    }
    setLatitude(nextLatitude.toFixed(6))
    setLongitude(nextLongitude.toFixed(6))
  }, [activeDraftImageId, activeImageLocationMode])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    updateDraftLocation(event.latlng.lat, event.latlng.lng)
  }, [updateDraftLocation])

  const handleMarkerDragEnd = useCallback((event: L.LeafletEvent) => {
    const marker = event.target as L.Marker
    const position = marker.getLatLng()
    updateDraftLocation(position.lat, position.lng)
  }, [updateDraftLocation])

  const handleSearchLocation = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    setSearchingLocation(true)
    setLocationSearchError(null)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`)
      const payload = await response.json().catch(() => ({} as { results?: Array<{ lat?: string; lon?: string }> }))
      const firstResult = Array.isArray(payload.results) ? payload.results[0] : null

      if (!response.ok || !firstResult?.lat || !firstResult?.lon) {
        throw new Error('No location found')
      }

      const lat = Number(firstResult.lat)
      const lng = Number(firstResult.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Invalid location coordinates')
      }

      updateDraftLocation(lat, lng)
      setMapOpen(true)
    } catch (err) {
      setLocationSearchError(err instanceof Error ? err.message : 'Failed to search location')
    } finally {
      setSearchingLocation(false)
    }
  }, [searchQuery, updateDraftLocation])

  const saveDraft = useCallback(async (options?: { silent?: boolean; overrideRoutesByImageId?: Record<string, DraftRoute[]> }) => {
    const silent = options?.silent === true
    const resolvedRoutesByImageId = options?.overrideRoutesByImageId ?? routesByImageId
    if (!draft || !draftUpdatedAt) return false

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setSavingDraft(true)
    if (silent) {
      setAutosaveState('saving')
    } else {
      setError(null)
      setSuccess(null)
    }

    try {
      const nextImagesPayload = buildDraftImagesPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages)
      const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
      if (creditHandle.trim().length > 0 && !normalizedHandle) {
        throw new Error('Invalid credit handle format')
      }

          const fullV2Metadata = serializeDraftMetadataV2({
            version: 2,
            navigation: {
              defaultImageId,
            },
            images: nextImagesPayload.reduce<Record<string, { imageId: string; displayOrder: number; orientation?: OrientationDirection[]; locationMode: 'shared' | 'custom'; gps: { latitude: number | null; longitude: number | null } }>>((acc, image) => {
              acc[image.id] = {
                imageId: image.id,
                displayOrder: image.display_order,
                orientation: orientationByImageId[image.id] || [],
                locationMode: locationModeByImageId[image.id] === 'custom' ? 'custom' : 'shared',
                gps: {
                  latitude: customGpsByImageId[image.id]?.latitude ?? null,
                  longitude: customGpsByImageId[image.id]?.longitude ?? null,
                },
              }
              return acc
            }, {}),
            submission: {
              routeType,
              location: {
                latitude: markerPosition ? markerPosition[0] : null,
                longitude: markerPosition ? markerPosition[1] : null,
              },
              isAnonymousSubmission,
              contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
              contributionCreditHandle: normalizedHandle,
              sectorId,
              canvasSource: canvasSource?.kind === 'crag-image'
                ? {
                    kind: 'crag-image',
                    cragImageId: canvasSource.cragImageId,
                    cragId: canvasSource.cragId,
                  }
                : canvasSource?.kind === 'draft-image'
                  ? {
                      kind: 'draft-image',
                      draftImageId: canvasSource.draftImageId,
                    }
                  : null,
            },
          })

          const savePayload: DraftSavePayload = {
            images: nextImagesPayload,
            cragId,
            metadata: fullV2Metadata as unknown as Record<string, unknown>,
          }

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...savePayload,
          expected_updated_at: draftUpdatedAt,
        }),
      })

      const payload = await response.json().catch(() => ({} as {
        error?: string
        code?: string
        message?: string
        draft?: { updated_at?: string }
        current_updated_at?: string
        current_data?: { last_updated_by?: string | null; last_updated_by_display_name?: string | null }
      }))

      if (!response.ok) {
        if (response.status === 409 && payload.code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
          const isSelfConflict = conflictPayload.current_data?.last_updated_by === currentUserId
          if (silent || isSelfConflict) {
            setDraftUpdatedAt(conflictPayload.current_updated_at)
            if (silent) {
              setAutosaveState('syncing')
              if (!isSelfConflict) {
              autosavePausedRef.current = true
              autosavePausedSnapshotRef.current = buildDraftAutosaveSignature({
                imagesPayloadSignature: JSON.stringify(buildDraftImagesPayload(draft.images, resolvedRoutesByImageId, routeType, manageImages)),
                defaultImageId,
                routeType,
                markerLatitude: markerPosition ? markerPosition[0] : null,
                markerLongitude: markerPosition ? markerPosition[1] : null,
                cragId,
                isAnonymousSubmission,
                creditPlatform,
                creditHandle: normalizedHandle,
                sectorId,
                canvasSource,
                orientationByImageId,
                locationModeByImageId,
                customGpsByImageId,
              })
              }
            } else {
              setAutosaveState('idle')
            }
            return false
          }
          setConflict({
            serverUpdatedAt: conflictPayload.current_updated_at,
            lastEditorName: conflictPayload.current_data?.last_updated_by_display_name || 'Another collaborator',
            pendingChanges: savePayload,
          })
          return false
        }
        throw new Error(payload.error || 'Failed to save draft')
      }

      setDraft((prev) => prev ? {
        ...prev,
        updated_at: payload.draft?.updated_at || prev.updated_at,
        last_edited_by: currentUserId,
        metadata: {
          ...fullV2Metadata,
        },
      } : prev)
      setDraftUpdatedAt(payload.draft?.updated_at || new Date().toISOString())
      lastPersistedRoutesRef.current = buildDraftAutosaveSignature({
        imagesPayloadSignature: JSON.stringify(savePayload.images),
        defaultImageId,
        routeType,
        markerLatitude: markerPosition ? markerPosition[0] : null,
        markerLongitude: markerPosition ? markerPosition[1] : null,
        cragId,
        isAnonymousSubmission,
        creditPlatform,
        creditHandle: normalizedHandle,
        sectorId,
        canvasSource,
        orientationByImageId,
        locationModeByImageId,
        customGpsByImageId,
      })
      setConflict(null)
      if (silent) {
        setAutosaveState('saved')
      } else {
        setAutosaveState('idle')
        setSuccess('Draft saved. Not published to the map.')
      }
      return true
    } catch (saveError) {
      setAutosaveState('idle')
      if (!silent) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      }
      return false
    } finally {
      setSavingDraft(false)
    }
  }, [canvasSource, cragId, creditHandle, creditPlatform, currentUserId, customGpsByImageId, defaultImageId, draft, draftUpdatedAt, isAnonymousSubmission, locationModeByImageId, manageImages, markerPosition, orientationByImageId, routeType, routesByImageId, sectorId])

  const scheduleDraftPersist = useCallback((nextRoutesByImageId: Record<string, DraftRoute[]>) => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    setAutosaveState('pending')
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null
      void saveDraft({ silent: true, overrideRoutesByImageId: nextRoutesByImageId })
    }, 1000)
  }, [saveDraft])

  const persistMetadataImmediately = useCallback((applyChange: () => void) => {
    applyChange()

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setAutosaveState('saving')
    window.setTimeout(() => {
      void saveDraft({ silent: true })
    }, 0)
  }, [saveDraft])

  const setActiveAsDefault = useCallback(() => {
    if (!activeImageTab || activeImageTab.sourceKind !== 'draft-image') return
    persistMetadataImmediately(() => {
      setDefaultImageId(activeImageTab.imageId)
      setCanvasSource({ kind: 'draft-image', draftImageId: activeImageTab.imageId })
    })
  }, [activeImageTab, persistMetadataImmediately])

  const handleEditRoutesUpdate = useCallback((routes: EditableRoute[]) => {
    if (!activeDraftImageId) return
    setRoutesByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const previousById = new Map(current.map((route) => [route.id, route]))
      const mapped = routes.map((route, index) => {
        const previous = previousById.get(route.id)
        return {
          id: route.id,
          name: route.name,
          grade: route.grade || previous?.grade || '6A',
          description: route.description,
          climbType: route.climbType || previous?.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: previous?.imageWidth || 1200,
          imageHeight: previous?.imageHeight || 1200,
        }
      })

      if (areDraftRoutesEqual(current, mapped)) return prev

      const nextRoutesByImageId = {
        ...prev,
        [activeDraftImageId]: mapped,
      }

      scheduleDraftPersist(nextRoutesByImageId)
      return nextRoutesByImageId
    })
  }, [activeDraftImageId, routeType, scheduleDraftPersist])

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    setRouteStoreRoutes(routes)
    const editableRoutes = routes.map((route) => ({
      id: route.id,
      name: route.climb?.name || 'Unnamed',
      grade: route.climb?.grade || '6A',
      climbType: typeof route.climb?.route_type === 'string' ? route.climb.route_type : undefined,
      description: route.climb?.description ?? undefined,
      points: route.points,
    }))
    handleEditRoutesUpdate(editableRoutes)
  }, [handleEditRoutesUpdate, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededRouteImageIdRef.current === activeDraftImageId) return

    lastSeededRouteImageIdRef.current = activeDraftImageId
    if (!areRouteLinesEqual(routeStoreRoutes, existingRouteLines)) {
      skipRouteStoreSyncRef.current = activeDraftImageId
      setRouteStoreRoutes(existingRouteLines)
    }
  }, [activeDraftImageId, existingRouteLines, routeStoreRoutes, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (skipRouteStoreSyncRef.current === activeDraftImageId) {
      skipRouteStoreSyncRef.current = null
      return
    }
    if (areRouteLinesEqual(routeStoreRoutes, existingRouteLines)) return
    handleCanvasRoutesUpdate(routeStoreRoutes)
  }, [activeDraftImageId, existingRouteLines, handleCanvasRoutesUpdate, routeStoreRoutes])

  const handleManualSave = useCallback(() => {
    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }
    void saveDraft()
  }, [saveDraft])

  useEffect(() => {
    if (!hasLoadedRoutesRef.current) return
    if (!draft || !draftUpdatedAt) return
    if (isInitialLoading || publishingDraft || savingDraft || !!conflict) return
    if (hasInFlightDraftUploads) return

    if (autosavePausedRef.current) {
      if (autosaveSignature === autosavePausedSnapshotRef.current) {
        return
      }
      autosavePausedRef.current = false
      autosavePausedSnapshotRef.current = ''
    }

    if (autosaveSignature === lastPersistedRoutesRef.current) {
      if (autosaveState === 'pending' || autosaveState === 'syncing') {
        setAutosaveState('idle')
      }
      return
    }

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
    }

    setAutosaveState('pending')
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null
      void saveDraft({ silent: true })
    }, 1000)

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [autosaveSignature, autosaveState, conflict, draft, draftUpdatedAt, hasInFlightDraftUploads, isInitialLoading, publishingDraft, saveDraft, savingDraft])

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [])

  const publishDraft = useCallback(async () => {
    if (!draft || !isOwner) return

    if (publishValidationMessage) {
      setPublishAttempted(true)
      setError(null)

      if (!cragId) {
        cragSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (!hasValidLocation) {
        locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (!defaultImageTab || defaultImageRoutes.length === 0) {
        if (defaultImageTab) {
          setActiveImageId(defaultImageTab.imageId)
        }
        publishRequirementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    setPublishAttempted(false)

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    setPublishingDraft(true)
    setError(null)

    try {
      const saved = await saveDraft()
      if (!saved) return

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}/promote`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({} as {
        error?: string
        published?: {
          imageId?: string
          defaultImageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
          canonicalPath?: string
          defaultRouteId?: string | null
        }
      }))

      if (!response.ok || !payload.published?.defaultImageId || !payload.published.canonicalPath) {
        throw new Error(payload.error || 'Failed to publish draft')
      }

      const imageCount = Array.isArray(payload.published.imageIds) ? payload.published.imageIds.length : 1
      const routeCount = Array.isArray(payload.published.routeLineIds) ? payload.published.routeLineIds.length : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} image${imageCount === 1 ? '' : 's'}.`, 'success')

      const query = new URLSearchParams({
        publishedImages: String(imageCount),
        publishedRoutes: String(routeCount),
      })
      if (payload.published.defaultRouteId) {
        query.set('route', payload.published.defaultRouteId)
      }
      router.push(`${payload.published.canonicalPath}?${query.toString()}`)
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : 'Failed to publish draft'
      setError(message)
      addToast(message, 'error')
    } finally {
      setPublishingDraft(false)
    }
  }, [addToast, cragId, defaultImageRoutes.length, defaultImageTab, draft, hasValidLocation, isOwner, publishValidationMessage, router, saveDraft])

  const handleReloadLatestDraft = useCallback(async () => {
    setConflict(null)
    setSuccess(null)
    await loadDraft()
    await loadCollaborators()
  }, [loadDraft, loadCollaborators])

  const handleCopyUnsavedEdits = useCallback(async () => {
    if (!conflict) return

    const textPayload = JSON.stringify(conflict.pendingChanges, null, 2)
    try {
      await navigator.clipboard.writeText(textPayload)
      addToast('Unsaved edits copied', 'success')
    } catch {
      setError('Failed to copy unsaved edits')
    }
  }, [conflict, addToast])

  if (isInitialLoading && !draft) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/80 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
          <div className="flex items-center justify-between gap-3">
          <Link
            href="/logbook"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to logbook
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={savingDraft || publishingDraft || !!conflict}
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save draft
            </button>
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={() => { void publishDraft() }}
                  disabled={publishingDraft || savingDraft || !!conflict || Boolean(draftId && (hasPendingUploads(draftId) || hasFailedUploads(draftId)))}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {publishingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Publish
                </button>
                <button
                  type="button"
                  onClick={() => { void handleDeleteDraft() }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete draft
                </button>
              </>
            ) : (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Waiting for owner to publish
              </span>
            )}
          </div>
          </div>
        </div>

        {autosaveState !== 'idle' ? (
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {autosaveState === 'pending'
              ? 'Autosave queued...'
              : autosaveState === 'saving'
                ? 'Autosaving...'
                : autosaveState === 'syncing'
                  ? 'Syncing...'
                  : 'Autosaved'}
          </div>
        ) : null}

        {collaborationAdded ? (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit this draft.
          </div>
        ) : null}

        {publishAttempted && publishValidationMessage ? (
          <div ref={publishRequirementsRef} className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {publishValidationMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!error && draft && manageImages.length === 0 ? (
          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {pendingDraftUploads.length > 0 || draft.images.some((image) => image.readiness_status === 'processing')
              ? 'Photos are still preparing for the editor. They should appear here once image access is ready.'
              : draft.images.length > 0 && draft.images.every((image) => image.readiness_status === 'error')
                ? 'Some photos failed to prepare for the editor. Try re-uploading the affected images.'
                : draft.images.length === 0 && pendingDraftUploads.length === 0
                  ? 'This draft has no photos yet. Add at least one image to continue.'
                  : 'Photos are still preparing for the editor. They should appear here once image access is ready.'}
          </div>
        ) : null}

        {success ? (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        ) : null}

        {pendingDraftUploads.length > 0 ? (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Background uploads</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Photos appear in the gallery as each upload finishes. Failed uploads are skipped — retry or delete them below.
                </p>
              </div>
              {queuePaused ? (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Queue paused
                </span>
              ) : draftId && hasPendingUploads(draftId) ? (
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                  Uploading
                </span>
              ) : draftId && hasFailedUploads(draftId) ? (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Attention needed
                </span>
              ) : null}
            </div>
            {queuePaused ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <span>The upload queue is paused. Resume to continue processing remaining uploads.</span>
                <button
                  type="button"
                  onClick={resumeQueue}
                  className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
                >
                  Resume
                </button>
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {pendingDraftUploads.filter((upload) => !upload.attachedRecordId).map((upload) => (
                <div key={upload.clientId} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                    {upload.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={upload.previewUrl} alt={upload.fileName} className="h-full w-full object-cover opacity-80" draggable={false} />
                    ) : (
                      <div className="h-full w-full animate-pulse bg-gray-200 dark:bg-gray-700" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{upload.fileName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {upload.status === 'FAILED'
                        ? upload.error || 'Upload failed'
                        : upload.status === 'QUEUED'
                          ? 'Waiting in queue'
                          : upload.status === 'PREPROCESSING'
                            ? 'Preparing image'
                            : `Uploading ${upload.progress}%`}
                    </p>
                  </div>
                  {upload.status === 'FAILED' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => retryUpload(upload.clientId)}
                        className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => { void removeUpload(upload.clientId) }}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="w-20">
                      {upload.status === 'UPLOADING' ? (
                        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                          <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${upload.progress}%` }} />
                        </div>
                      ) : upload.status === 'PREPROCESSING' ? (
                        <div className="h-2 rounded-full bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 dark:from-gray-700 dark:via-gray-500 dark:to-gray-700" />
                      ) : (
                        <div className="rounded-full bg-gray-100 px-2 py-1 text-center text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                          Queued
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <input
          ref={addImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleAddImages(event.target.files)
          }}
        />

        {imageSelection && 'imageUrl' in imageSelection ? (
          <SubmissionWorkstation
            drawingAreaRef={drawingAreaRef}
            routeCanvasRef={routeCanvasRef}
            quickSwitcherImages={quickSwitcherImages}
            activeImageId={activeImageId}
            activeImageUrl={stableActiveImageUrl}
            activeImageReady={activeImageReady}
            activeImageStatus={activeImageTab?.status}
            onRetryActiveImage={activeImageTab?.status === 'FAILED' ? () => retryUpload(activeImageTab.imageId) : undefined}
            onDeleteActiveImage={activeImageTab?.status === 'FAILED' ? () => { void handleRemoveImage(activeImageTab.imageId) } : undefined}
            draftPins={draftMapPins}
            publishedPins={publishedMapPins}
            initialCenter={markerPosition}
            hideRouteActions={mapOpen}
            onSelectImage={handleQuickSwitchImage}
            onReorderImages={(imageIds) => {
              setManageImages((prev) => reorderItemsByIds(prev, imageIds).map((image) => ({
                ...image,
                locationMode: resolveLocationMode(locationModeByImageId[image.imageId] || image.locationMode),
              })))
            }}
            existingRouteLines={existingRouteLines}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(routeId) => {
              setSelectedRoute(routeId)
              setActiveRoute(routeId)
              setEditorPanelOpen(true)
            }}
            onReorderRoutes={(routeIds) => {
              if (!activeDraftImageId) return
              setRoutesByImageId((prev) => {
                const current = prev[activeDraftImageId] || []
                const nextRoutes = resequenceRoutes(current, routeIds)
                const nextRoutesByImageId = {
                  ...prev,
                  [activeDraftImageId]: nextRoutes,
                }
                skipRouteStoreSyncRef.current = activeDraftImageId
                setRouteStoreRoutes(resequenceRoutes(existingRouteLines, routeIds) as RouteLine[])
                scheduleDraftPersist(nextRoutesByImageId)
                return nextRoutesByImageId
              })
            }}
            interactionTool={interactionTool === 'select' ? 'select' : 'draw'}
            currentPointsCount={currentPoints.length}
            onSetSelectTool={() => {
              setInteractionTool('select')
              setEditorPanelOpen(true)
            }}
            onSetDrawTool={() => {
              setInteractionTool('draw')
              setEditorPanelOpen(false)
            }}
            onUndoPoint={() => undoLastPoint()}
            onFinishRoute={() => routeCanvasRef.current?.finishRoute()}
            canvasKey={activeImageTab?.imageId || 'draft-canvas'}
            defaultClimbType={resolveDraftClimbType(routeType)}
            extraAction={activeImageTab ? (
              <button
                type="button"
                onClick={setActiveAsDefault}
                disabled={!activeImageReady}
                className="inline-flex h-9 items-center rounded-xl border border-blue-200 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                Default
              </button>
            ) : null}
            addAction={{ loading: addingImages, disabled: !!conflict, onClick: () => addImageInputRef.current?.click() }}
            removeAction={activeImageTab ? {
              loading: removingImageId === activeImageTab.imageId,
              disabled: quickSwitcherImages.length <= 1 || !!conflict,
              onClick: () => { void handleRemoveImage(activeImageTab.imageId) },
            } : undefined}
            onQuickBarDropFiles={handleQuickBarDropFiles}
            onRoutesUpdate={handleCanvasRoutesUpdate}
          />
        ) : null}

        <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <AtlasContextCard result={atlasSync} />
        </div>

        <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft metadata</h2>
          </div>
          <div ref={locationSectionRef} className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            {selectedCrag && !showCragSelector ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCrag.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {typeof selectedCrag.latitude === 'number' && Number.isFinite(selectedCrag.latitude)
                      && typeof selectedCrag.longitude === 'number' && Number.isFinite(selectedCrag.longitude)
                      && (selectedCrag.latitude !== 0 || selectedCrag.longitude !== 0)
                      ? `${selectedCrag.latitude.toFixed(4)}, ${selectedCrag.longitude.toFixed(4)}`
                      : 'Crag selected'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCragSelector(true)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-700 dark:text-gray-200">Select an existing crag or create a new one.</p>
                {!showCragSelector ? (
                  <button
                    type="button"
                    onClick={() => setShowCragSelector(true)}
                    className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Select crag
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {showCragSelector ? (
            <div className="mb-3">
              <CragSelector
                selectedCragId={cragId}
                latitude={selectedCrag ? selectedCrag.latitude : (latitude ? parseFloat(latitude) : null)}
                longitude={selectedCrag ? selectedCrag.longitude : (longitude ? parseFloat(longitude) : null)}
                onSelect={(crag) => {
                  setCragId(crag.id)
                  setSelectedCrag({
                    id: crag.id,
                    name: crag.name,
                    latitude: crag.latitude,
                    longitude: crag.longitude,
                  })
                  setCragCanvasImages([])
                  setShowCragSelector(false)
                  setSuccess('Crag selected for this draft.')
                  void saveDraft({ silent: true })
                }}
                onCreateNew={(crag) => {
                  setCragId(crag.id)
                  setSelectedCrag({
                    id: crag.id,
                    name: crag.name,
                    latitude: crag.latitude,
                    longitude: crag.longitude,
                  })
                  setCragCanvasImages([])
                  setCanvasSource(null)
                  setSuccess(`Crag "${crag.name}" created. Upload up to 20 photos and the first ready image can be used as your canvas.`)
                  setShowCragSelector(false)
                  void saveDraft({ silent: true })
                }}
              />
            </div>
          ) : null}

          {selectedCrag && !showCragSelector ? (
            <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Sector</h3>
              <SectorSelector
                cragId={cragId}
                value={sectorId}
                onChange={setSectorId}
                placeholder="Select sector (optional)"
              />
            </div>
          ) : null}

          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Image location</h3>
            <div className="mb-3 inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  if (!activeDraftImageId) return
                  setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'shared' }))
                  setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'shared' } : image))
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeImageLocationMode === 'shared' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                Submission location
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeDraftImageId) return
                  setLocationModeByImageId((prev) => ({ ...prev, [activeDraftImageId]: 'custom' }))
                  setCustomGpsByImageId((prev) => ({
                    ...prev,
                    [activeDraftImageId]: prev[activeDraftImageId] || {
                      latitude: markerPosition?.[0] ?? null,
                      longitude: markerPosition?.[1] ?? null,
                    },
                  }))
                  setManageImages((prev) => prev.map((image) => image.imageId === activeDraftImageId ? { ...image, locationMode: 'custom' } : image))
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeImageLocationMode === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                This image only
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              `Submission location` uses the same pin as any other image assigned to the draft-level location. `This image only` keeps its own exact coordinates.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Latitude
                <input
                  value={activeImageLocationMode === 'custom' && activeDraftImageId ? String(customGpsByImageId[activeDraftImageId]?.latitude ?? '') : latitude}
                  onChange={(event) => {
                    if (activeImageLocationMode === 'custom' && activeDraftImageId) {
                      const nextLatitude = event.target.value
                      setCustomGpsByImageId((prev) => ({
                        ...prev,
                        [activeDraftImageId]: {
                          latitude: nextLatitude.trim() === '' ? null : Number(nextLatitude),
                          longitude: prev[activeDraftImageId]?.longitude ?? null,
                        },
                      }))
                      return
                    }
                    setLatitude(event.target.value)
                  }}
                  placeholder="e.g. 48.4049"
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Longitude
                <input
                  value={activeImageLocationMode === 'custom' && activeDraftImageId ? String(customGpsByImageId[activeDraftImageId]?.longitude ?? '') : longitude}
                  onChange={(event) => {
                    if (activeImageLocationMode === 'custom' && activeDraftImageId) {
                      const nextLongitude = event.target.value
                      setCustomGpsByImageId((prev) => ({
                        ...prev,
                        [activeDraftImageId]: {
                          latitude: prev[activeDraftImageId]?.latitude ?? null,
                          longitude: nextLongitude.trim() === '' ? null : Number(nextLongitude),
                        },
                      }))
                      return
                    }
                    setLongitude(event.target.value)
                  }}
                  placeholder="e.g. 2.6920"
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </label>
            </div>

            {mapOpen ? (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Click map or drag marker to adjust location</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await saveDraft({ silent: true })
                      setMapOpen(false)
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Done
              </button>
            </div>
                <div className="h-72 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <MapContainer
                    center={effectiveMarkerPosition || [20, 0]}
                    zoom={effectiveMarkerPosition ? 14 : 2}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <MapRecenter position={effectiveMarkerPosition} />
                    <MapClickHandler onClick={handleMapClick} />
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution="Imagery © Esri"
                      maxZoom={19}
                    />
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                      attribution="Labels © Esri"
                      maxZoom={19}
                    />
                    {effectiveMarkerPosition && leaflet ? (
                      <Marker
                        position={effectiveMarkerPosition}
                        draggable={true}
                        icon={leaflet.divIcon({
                          className: 'location-marker',
                          iconSize: [20, 20],
                          iconAnchor: [10, 10],
                        })}
                        eventHandlers={{ dragend: handleMarkerDragEnd }}
                      />
                    ) : null}
                  </MapContainer>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="mt-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Adjust location on map
              </button>
            )}

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSearchLocation()
                    }
                  }}
                  placeholder="Search for a location..."
                  className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleSearchLocation()
                }}
                disabled={searchingLocation}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {searchingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Search
              </button>
            </div>

            {locationSearchError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{locationSearchError}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Route type default
              <select
                value={routeType}
                onChange={(event) => {
                  const nextRouteType = event.target.value
                  persistMetadataImmediately(() => {
                    setRouteType(nextRouteType)
                  })
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="sport">Sport</option>
                <option value="boulder">Boulder</option>
                <option value="trad">Trad</option>
                <option value="deep-water-solo">Deep water solo</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={detailsOpen}
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">More details</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Orientation, collaborators, and credit settings.</p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${detailsOpen ? 'rotate-180' : ''}`} />
          </button>

          {detailsOpen ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                <button
                  type="button"
                  onClick={() => setOrientationOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={orientationOpen}
                >
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Set Orientation</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional metadata for each image.</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${orientationOpen ? 'rotate-180' : ''}`} />
                </button>
                {orientationOpen ? (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {FACE_DIRECTIONS.map((direction) => {
                      const selected = activeImageTab ? (orientationByImageId[activeImageTab.imageId] || []).includes(direction) : false
                      return (
                        <button
                          key={direction}
                          type="button"
                          onClick={() => toggleImageOrientation(direction)}
                          className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                          }`}
                        >
                          {direction}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Collaborators</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                  >
                    Manage collaborators
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contribution credit</h2>
                </div>
                <label className="mb-3 flex items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={isAnonymousSubmission}
                    onChange={(event) => setIsAnonymousSubmission(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                  <span>
                    <span className="block font-medium text-gray-900 dark:text-gray-100">Publish anonymously</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      Your upload stays editable in your logbook, but your public profile, submitter name, and credit link stay hidden.
                    </span>
                  </span>
                </label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="text-xs text-gray-600 dark:text-gray-300">
                    Platform
                    <select
                      value={creditPlatform}
                      onChange={(event) => setCreditPlatform(event.target.value as SubmissionCreditPlatform)}
                      disabled={isAnonymousSubmission}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    >
                      {CREDIT_PLATFORM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-gray-600 dark:text-gray-300 md:col-span-2">
                    Handle
                    <input
                      value={creditHandle}
                      onChange={(event) => setCreditHandle(event.target.value)}
                      placeholder="handle"
                      disabled={isAnonymousSubmission}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {isAnonymousSubmission
                    ? 'Credit is hidden while anonymous publishing is on.'
                    : `Shown publicly as @${normalizeSubmissionCreditHandle(creditHandle) || 'handle'} after publish.`}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft collaborators</DialogTitle>
              <DialogDescription>
                {isOwner
                  ? 'Create a link for collaborators to help edit this draft before publishing.'
                  : 'You can view collaborators. Only the owner can manage invites.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  <Link2 className="h-4 w-4" />
                  Invite link
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => { void handleCreateInvite() }}
                    disabled={creatingInvite}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create new link
                  </button>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Only the owner can create invite links.</p>
                )}

                {latestInviteUrl ? (
                  <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                    <p className="break-all text-gray-700 dark:text-gray-200">{latestInviteUrl}</p>
                    <button
                      type="button"
                      onClick={() => { void handleCopyInvite(latestInviteUrl) }}
                      className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Copy link
                    </button>
                  </div>
                ) : null}

                {activeInvites.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {activeInvites.map((invite) => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : ''
                      const inviteUrl = `${origin}/api/submissions/drafts/collaborate/${invite.token}`
                      return (
                        <div key={invite.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-700">
                          <p className="break-all text-gray-600 dark:text-gray-300">{inviteUrl}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { void handleCopyInvite(inviteUrl) }}
                              className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Copy
                            </button>
                            {isOwner ? (
                              <button
                                type="button"
                                onClick={() => { void handleRevokeInvite(invite.id) }}
                                disabled={revokingInviteId === invite.id}
                                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                              >
                                {revokingInviteId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Revoke
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  <Users className="h-4 w-4" />
                  Collaborators
                </div>

                {loadingCollaborators ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading collaborators...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ownerUserId && ownerProfile ? (
                      <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ownerProfile.displayName} (Owner)</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                        </div>
                      </div>
                    ) : null}

                    {collaborators.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No collaborators yet.</p>
                    ) : (
                      collaborators.map((collaborator) => (
                        <div key={collaborator.userId} className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{collaborator.profile.displayName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{collaborator.profile.username ? `@${collaborator.profile.username}` : 'No username'}</p>
                          </div>
                          {isOwner ? (
                            <button
                              type="button"
                              onClick={() => { void handleRemoveCollaborator(collaborator.userId) }}
                              disabled={removingCollaboratorId === collaborator.userId}
                              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {removingCollaboratorId === collaborator.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}

                    {!isOwner && currentUserId ? (
                      <button
                        type="button"
                        onClick={() => { void handleRemoveCollaborator(currentUserId) }}
                        disabled={removingCollaboratorId === currentUserId}
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                      >
                        {removingCollaboratorId === currentUserId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Leave draft
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!conflict} onOpenChange={() => {}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft updated by another collaborator</DialogTitle>
              <DialogDescription>
                {conflict?.lastEditorName
                  ? `${conflict.lastEditorName} saved a newer version of this draft.`
                  : 'A newer version exists on the server.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Reload the latest draft before continuing. You can copy your unsaved edits first.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void handleReloadLatestDraft() }}
                  className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Reload latest draft
                </button>
                <button
                  type="button"
                  onClick={() => { void handleCopyUnsavedEdits() }}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Copy unsaved edits
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
