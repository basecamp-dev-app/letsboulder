'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { SubmissionStep, Crag, ImageSelection, NewRouteData, SubmissionContext, GpsData, ClimbType, FaceDirection, NewUploadedImage } from '@/lib/submission-types'
import { csrfFetch, primeCsrfToken } from '@/hooks/useCsrf'
import { useSubmitContext } from '@/lib/submit-context'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { draftStorageGetItem, draftStorageRemoveItem, draftStorageSetItem } from '@/lib/submit-draft-storage'
import { getSignedUrlBatchKey, type SignedUrlBatchResponse } from '@/lib/signed-url-batch'
import SubmissionCredit from '@/components/SubmissionCredit'

const dynamic = nextDynamic
const ROUTE_DRAFT_PREFIX = 'submit-route-draft:'
const ROUTE_DRAFT_INDEX_KEY = 'submit-route-drafts:index'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FACE_DIRECTIONS: FaceDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

interface ServerDraftImagePayload {
  id: string
  display_order: number
  storage_bucket: string
  storage_path: string
  width: number | null
  height: number | null
  route_data: Record<string, unknown> | null
  signed_url: string | null
}

interface ServerDraftPayload {
  id: string
  crag_id: string | null
  status: 'draft' | 'submitted'
  metadata: Record<string, unknown> | null
  crags: {
    name?: string | null
    latitude?: number | null
    longitude?: number | null
  } | Array<{
    name?: string | null
    latitude?: number | null
    longitude?: number | null
  }> | null
  images: ServerDraftImagePayload[]
}

interface PendingFace {
  cragImageId: string
  imageUrl: string
  width: number | null
  height: number | null
}

interface ServerDraftSession {
  id: string
  imageIds: string[]
}

interface DraftImageSelectionSnapshotExisting {
  mode: 'existing'
  imageId: string
  imageUrl: string
}

interface DraftImageSelectionSnapshotNew {
  mode: 'new'
  images: NewUploadedImage[]
  primaryIndex: number
}

interface DraftImageSelectionSnapshotCragImage {
  mode: 'crag-image'
  cragImageId: string
  imageUrl: string
  linkedImageId: string | null
  width: number | null
  height: number | null
}

type DraftImageSelectionSnapshot =
  | DraftImageSelectionSnapshotExisting
  | DraftImageSelectionSnapshotNew
  | DraftImageSelectionSnapshotCragImage

interface RouteDraftIndexEntry {
  draftKey: string
  updatedAt: number
  expiresAt: number
  routeCount: number
  image: DraftImageSelectionSnapshot
  crag: NonNullable<SubmissionContext['crag']>
  imageGps: SubmissionContext['imageGps']
  faceDirections: FaceDirection[]
}

function readDraftIndex(): RouteDraftIndexEntry[] {
  try {
    const raw = draftStorageGetItem(ROUTE_DRAFT_INDEX_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry): entry is RouteDraftIndexEntry => {
        if (!entry || typeof entry !== 'object') return false
        const candidate = entry as Partial<RouteDraftIndexEntry>
        return typeof candidate.draftKey === 'string' && typeof candidate.updatedAt === 'number' && !!candidate.image && !!candidate.crag
      })
      .map((entry) => ({
        ...entry,
        expiresAt: typeof entry.expiresAt === 'number' ? entry.expiresAt : entry.updatedAt + DRAFT_TTL_MS,
        routeCount: typeof entry.routeCount === 'number' ? entry.routeCount : 0,
      }))
  } catch {
    return []
  }
}

function writeDraftIndex(entries: RouteDraftIndexEntry[]) {
  draftStorageSetItem(ROUTE_DRAFT_INDEX_KEY, JSON.stringify(entries))
}

function upsertDraftIndex(entry: RouteDraftIndexEntry) {
  const normalizedEntry: RouteDraftIndexEntry = {
    ...entry,
    expiresAt: entry.expiresAt || entry.updatedAt + DRAFT_TTL_MS,
  }
  const existing = readDraftIndex().filter((item) => item.draftKey !== entry.draftKey)
  existing.unshift(normalizedEntry)
  writeDraftIndex(existing.slice(0, 20))
}

function removeDraftIndexEntry(draftKey: string) {
  const next = readDraftIndex().filter((entry) => entry.draftKey !== draftKey)
  writeDraftIndex(next)
}

function pruneDraftIndex(): RouteDraftIndexEntry[] {
  const now = Date.now()
  const next: RouteDraftIndexEntry[] = []

  for (const entry of readDraftIndex()) {
    if (entry.expiresAt <= now) {
      draftStorageRemoveItem(entry.draftKey)
      continue
    }

    if (!draftStorageGetItem(entry.draftKey)) {
      continue
    }

    next.push(entry)
  }

  next.sort((a, b) => b.updatedAt - a.updatedAt)
  const capped = next.slice(0, 20)
  writeDraftIndex(capped)
  return capped
}

function toImageSnapshot(image: ImageSelection): DraftImageSelectionSnapshot {
  if (image.mode === 'existing') {
    return {
      mode: 'existing',
      imageId: image.imageId,
      imageUrl: image.imageUrl,
    }
  }

  if (image.mode === 'crag-image') {
    return {
      mode: 'crag-image',
      cragImageId: image.cragImageId,
      imageUrl: image.imageUrl,
      linkedImageId: image.linkedImageId,
      width: image.width,
      height: image.height,
    }
  }

  return {
    mode: 'new',
    images: image.images,
    primaryIndex: image.primaryIndex,
  }
}

function getDraftRouteCount(draftKey: string): number {
  try {
    const raw = draftStorageGetItem(draftKey)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as {
      completedRoutes?: Array<unknown>
      currentPoints?: Array<unknown>
      expiresAt?: number
    }
    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < Date.now()) {
      draftStorageRemoveItem(draftKey)
      return 0
    }
    const completedCount = Array.isArray(parsed.completedRoutes) ? parsed.completedRoutes.length : 0
    const hasCurrentPoints = Array.isArray(parsed.currentPoints) && parsed.currentPoints.length > 1
    return completedCount > 0 ? completedCount : hasCurrentPoints ? 1 : 0
  } catch {
    return 0
  }
}

function getRouteDraftKey(context: SubmissionContext): string | null {
  if (!context.image || !context.crag?.id) return null

  if (context.image.mode === 'new') {
    const primaryImage = context.image.images[context.image.primaryIndex]
    if (!primaryImage?.uploadedBucket || !primaryImage?.uploadedPath) return null
    return `${ROUTE_DRAFT_PREFIX}new:${primaryImage.uploadedBucket}:${primaryImage.uploadedPath}:${context.crag.id}`
  }

  if (context.image.mode === 'crag-image') {
    return `${ROUTE_DRAFT_PREFIX}crag-image:${context.image.cragImageId}:${context.crag.id}`
  }

  return `${ROUTE_DRAFT_PREFIX}existing:${context.image.imageId}:${context.crag.id}`
}

function getRouteDraftKeyFromImageAndCrag(image: ImageSelection | null, cragId: string | null): string | null {
  if (!image || !cragId) return null

  if (image.mode === 'new') {
    const primaryImage = image.images[image.primaryIndex]
    if (!primaryImage?.uploadedBucket || !primaryImage?.uploadedPath) return null
    return `${ROUTE_DRAFT_PREFIX}new:${primaryImage.uploadedBucket}:${primaryImage.uploadedPath}:${cragId}`
  }

  if (image.mode === 'crag-image') {
    return `${ROUTE_DRAFT_PREFIX}crag-image:${image.cragImageId}:${cragId}`
  }

  return `${ROUTE_DRAFT_PREFIX}existing:${image.imageId}:${cragId}`
}

function resolveImageGps(context: SubmissionContext): GpsData | null {
  if (context.imageGps) {
    return { latitude: context.imageGps.latitude, longitude: context.imageGps.longitude }
  }

  if (context.image?.mode === 'new') {
    const primaryImage = context.image.images[context.image.primaryIndex]
    if (primaryImage?.gpsData) {
      return { latitude: primaryImage.gpsData.latitude, longitude: primaryImage.gpsData.longitude }
    }
  }

  return null
}

const CragSelector = dynamic(() => import('./components/CragSelector'), { ssr: false })
const ImagePicker = dynamic(() => import('./components/ImagePicker'), { ssr: false })
const RouteCanvas = dynamic(() => import('./components/RouteCanvas'), { ssr: false })
const LocationPicker = dynamic(() => import('./components/LocationPicker'), { ssr: false })
const FaceDirectionPicker = dynamic(() => import('./components/FaceDirectionPicker'), { ssr: false })
const CragImageCanvasPicker = dynamic(() => import('./components/CragImageCanvasPicker'), { ssr: false })

function SubmitPageContent() {
  const { routes, setRoutes, setIsSubmitting, isSubmitting } = useSubmitContext()
  const { toasts, addToast, removeToast } = useToast()
  const [step, setStep] = useState<SubmissionStep>({ step: 'image' })
  const [selectedRouteType, setSelectedRouteType] = useState<ClimbType | null>(null)
  const [context, setContext] = useState<SubmissionContext>({
    crag: null,
    image: null,
    imageGps: null,
    faceDirections: [],
    routes: [],
    routeType: null
  })
  const [, setError] = useState<string | null>(null)
  const [resumableDraftRouteCount, setResumableDraftRouteCount] = useState(0)
  const [resumableDraftEntry, setResumableDraftEntry] = useState<RouteDraftIndexEntry | null>(null)
  const [isResumingDraft, setIsResumingDraft] = useState(false)
  const [pendingFaces, setPendingFaces] = useState<PendingFace[]>([])
  const [batchTotalFaces, setBatchTotalFaces] = useState<number | null>(null)
  const [batchCurrentFace, setBatchCurrentFace] = useState<number | null>(null)
  const [batchCreatedClimbs, setBatchCreatedClimbs] = useState(0)
  const [isFinalizingBatch, setIsFinalizingBatch] = useState(false)
  const [drawSessionVersion, setDrawSessionVersion] = useState(0)
  const [serverDraftSession, setServerDraftSession] = useState<ServerDraftSession | null>(null)
  const serverDraftRouteDataRef = useRef<Record<number, unknown>>({})
  const serverDraftAutosaveInFlightRef = useRef(false)
  const serverDraftLastPayloadRef = useRef<string>('')
  const isCreatingDraftRef = useRef(false)
  const routeDraftKey = getRouteDraftKey(context)
  const stepDraftKey = step.step === 'draw' || step.step === 'climbType' ? step.draftKey : undefined
  const activeDraftKey = stepDraftKey || routeDraftKey
  const router = useRouter()
  const searchParams = useSearchParams()
  const moderationRealtimeRef = useRef<{
    client: ReturnType<typeof createClient> | null
    channel: RealtimeChannel | null
    timeoutId: number | null
  }>({ client: null, channel: null, timeoutId: null })
  const hasShownRejectionToastRef = useRef(false)
  const submitRoutesRef = useRef<((routeType?: ClimbType) => Promise<void>) | null>(null)
  const latestRoutesRef = useRef<NewRouteData[]>([])
  const latestFaceDirectionsRef = useRef<FaceDirection[]>([])
  const routesLengthRef = useRef(0)
  const isSubmittingRef = useRef(false)

  routesLengthRef.current = routes.length
  isSubmittingRef.current = isSubmitting

  const stopModerationRealtime = useCallback(() => {
    if (moderationRealtimeRef.current.timeoutId) {
      window.clearTimeout(moderationRealtimeRef.current.timeoutId)
    }

    const { client, channel } = moderationRealtimeRef.current
    if (client && channel) {
      void client.removeChannel(channel)
    }

    moderationRealtimeRef.current = { client: null, channel: null, timeoutId: null }
  }, [])

  const startModerationRejectionRealtime = useCallback((userId: string) => {
    if (hasShownRejectionToastRef.current) return
    stopModerationRealtime()

    const supabase = createClient()
    const channel = supabase
      .channel(`notifications-realtime-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (hasShownRejectionToastRef.current) return

          const notification = payload.new as { id?: string; type?: string; title?: string }
          if (notification.type !== 'moderation' || notification.title !== 'Photo rejected') {
            return
          }

          hasShownRejectionToastRef.current = true
          stopModerationRealtime()
          addToast('Image rejected.', 'error')

          if (notification.id) {
            await csrfFetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {})
          }
        }
      )
      .subscribe()

    moderationRealtimeRef.current.client = supabase
    moderationRealtimeRef.current.channel = channel
    moderationRealtimeRef.current.timeoutId = window.setTimeout(() => {
      stopModerationRealtime()
    }, 30000)
  }, [addToast, stopModerationRealtime])

  useEffect(() => {
    return () => {
      stopModerationRealtime()
    }
  }, [stopModerationRealtime])

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth?redirect_to=/submit')
        return
      }

      const pendingUpload = sessionStorage.getItem('pendingUpload')
      if (pendingUpload) {
        try {
          const data = JSON.parse(pendingUpload)
          const derivedPath = typeof data.imagePath === 'string' && data.imagePath
            ? data.imagePath
            : (typeof data.imageUrl === 'string' && data.imageUrl.includes('/route-uploads/')
              ? data.imageUrl.split('/route-uploads/')[1]?.split('?')[0] || ''
              : '')
          sessionStorage.removeItem('pendingUpload')

          const newImageSelection: ImageSelection = {
            mode: 'new',
            images: [
              {
                uploadedBucket: data.imageBucket || 'route-uploads',
                uploadedPath: derivedPath,
                uploadedUrl: data.imageUrl,
                gpsData: { latitude: data.latitude, longitude: data.longitude },
                captureDate: data.captureDate || null,
                width: 1200,
                height: 1200,
                naturalWidth: 1200,
                naturalHeight: 1200,
              }
            ],
            primaryIndex: 0,
          }

          const gps = { latitude: data.latitude, longitude: data.longitude }
          setContext(prev => ({ ...prev, image: newImageSelection, imageGps: gps, faceDirections: [] }))
          setStep({
            step: 'faceDirection',
            imageGps: gps
          })
        } catch {
          sessionStorage.removeItem('pendingUpload')
        }
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    void primeCsrfToken().catch(() => {})
  }, [serverDraftSession])

  useEffect(() => {
    const draftId = searchParams.get('draftId')
    if (!draftId) return

    let cancelled = false

    const loadServerDraft = async () => {
      try {
        const response = await fetch(`/api/submissions/drafts/${draftId}`)
        const payload = await response.json().catch(() => ({} as { error?: string; draft?: ServerDraftPayload }))

        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || 'Failed to load submission draft')
        }

        const draft = payload.draft
        const images: ServerDraftImagePayload[] = Array.isArray(draft.images) ? draft.images : []
        const uploadedImages: NewUploadedImage[] = images
          .sort((a: ServerDraftImagePayload, b: ServerDraftImagePayload) => a.display_order - b.display_order)
          .map((image: ServerDraftImagePayload) => ({
            uploadedBucket: image.storage_bucket,
            uploadedPath: image.storage_path,
            uploadedUrl: image.signed_url || '',
            gpsData: null,
            captureDate: null,
            width: image.width || 1200,
            height: image.height || 1200,
            naturalWidth: image.width || 1200,
            naturalHeight: image.height || 1200,
          }))
          .filter((image: NewUploadedImage) => !!image.uploadedUrl)

        setServerDraftSession({
          id: draft.id,
          imageIds: images
            .sort((a: ServerDraftImagePayload, b: ServerDraftImagePayload) => a.display_order - b.display_order)
            .map((image: ServerDraftImagePayload) => image.id),
        })

        serverDraftRouteDataRef.current = {}
        images.forEach((image) => {
          serverDraftRouteDataRef.current[image.display_order] = image.route_data || {}
        })

        if (uploadedImages.length === 0) {
          throw new Error('This draft has no accessible photos')
        }

        const metadata = draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {}
        const metadataPrimaryIndex = typeof metadata.primaryIndex === 'number' ? metadata.primaryIndex : 0
        const primaryIndex = metadataPrimaryIndex >= 0 && metadataPrimaryIndex < uploadedImages.length ? metadataPrimaryIndex : 0

        const cragRelation = Array.isArray(draft.crags) ? draft.crags[0] : draft.crags
        const nextCrag = draft.crag_id
          ? {
              id: draft.crag_id,
              name: cragRelation?.name || 'Selected crag',
              latitude: typeof cragRelation?.latitude === 'number' ? cragRelation.latitude : null,
              longitude: typeof cragRelation?.longitude === 'number' ? cragRelation.longitude : null,
            }
          : null

        const metadataFaceDirections = Array.isArray((metadata as { faceDirections?: unknown }).faceDirections)
          ? (metadata as { faceDirections: unknown[] }).faceDirections
          : []

        const nextFaceDirections = metadataFaceDirections
          .filter((value): value is FaceDirection => typeof value === 'string' && FACE_DIRECTIONS.includes(value as FaceDirection))

        const primaryImageId = images[primaryIndex]?.id || images[0]?.id || 'server'
        const serverDraftKey = `${ROUTE_DRAFT_PREFIX}server:${draft.id}:${primaryImageId}`
        const routeData = images[primaryIndex]?.route_data

        if (routeData && typeof routeData === 'object') {
          draftStorageSetItem(
            serverDraftKey,
            JSON.stringify({
              ...routeData,
              updatedAt: Date.now(),
              expiresAt: Date.now() + DRAFT_TTL_MS,
            })
          )
        }

        if (cancelled) return

        const selection: ImageSelection = {
          mode: 'new',
          images: uploadedImages,
          primaryIndex,
        }

        setContext((prev) => ({
          ...prev,
          image: selection,
          imageGps: null,
          faceDirections: nextFaceDirections,
          crag: nextCrag,
          routes: [],
        }))

        if (nextCrag) {
          setStep({
            step: 'draw',
            imageGps: null,
            cragId: nextCrag.id,
            cragName: nextCrag.name,
            image: selection,
            draftKey: serverDraftKey,
          })
        } else {
          setStep({ step: 'crag', imageGps: null })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load submission draft'
        setError(message)
        addToast(message, 'error')
      }
    }

    void loadServerDraft()

    return () => {
      cancelled = true
    }
  }, [searchParams, addToast])

  useEffect(() => {
    setRoutes(context.routes)
  }, [context.routes, setRoutes])

  useEffect(() => {
    if (step.step !== 'image') {
      setResumableDraftRouteCount(0)
      setResumableDraftEntry(null)
      return
    }

    const index = pruneDraftIndex()
    const next: RouteDraftIndexEntry[] = []

    for (const entry of index) {
      const routeCount = getDraftRouteCount(entry.draftKey)
      if (routeCount <= 0) continue
      next.push({ ...entry, routeCount })
    }

    next.sort((a, b) => b.updatedAt - a.updatedAt)
    writeDraftIndex(next)

    if (next.length === 0) {
      setResumableDraftRouteCount(0)
      setResumableDraftEntry(null)
      return
    }

    setResumableDraftEntry(next[0])
    setResumableDraftRouteCount(next[0].routeCount)
  }, [step.step])

  useEffect(() => {
    if ((step.step !== 'draw' && step.step !== 'climbType') || !activeDraftKey || !context.image || !context.crag) {
      return
    }

    const resolvedImageGps = resolveImageGps(context)

    upsertDraftIndex({
      draftKey: activeDraftKey,
      updatedAt: Date.now(),
      expiresAt: Date.now() + DRAFT_TTL_MS,
      routeCount: context.routes.length,
      image: toImageSnapshot(context.image),
      crag: context.crag,
      imageGps: resolvedImageGps,
      faceDirections: context.faceDirections,
    })
  }, [step.step, activeDraftKey, context, context.routes.length])

  useEffect(() => {
    const handleSubmitRoutes = () => {
      if ((routesLengthRef.current > 0 || latestRoutesRef.current.length > 0) && !isSubmittingRef.current) {
        void submitRoutesRef.current?.()
      }
    }
    window.addEventListener('submit-routes', handleSubmitRoutes)
    return () => window.removeEventListener('submit-routes', handleSubmitRoutes)
  }, [serverDraftSession])

  const handleImageSelect = useCallback((selection: ImageSelection, gpsData: GpsData | null) => {
    const selectionGps = selection.mode === 'new' ? (selection.images[selection.primaryIndex]?.gpsData || null) : null
    const resolvedGps = gpsData || selectionGps
    const gps = resolvedGps ? { latitude: resolvedGps.latitude, longitude: resolvedGps.longitude } : null
    latestFaceDirectionsRef.current = []
    setDrawSessionVersion(0)
    setPendingFaces([])
    setBatchTotalFaces(selection.mode === 'new' && selection.images.length > 1 ? selection.images.length : null)
    setBatchCurrentFace(selection.mode === 'new' && selection.images.length > 1 ? 1 : null)
    setContext(prev => ({ ...prev, image: selection, imageGps: gps, faceDirections: [] }))

    setStep({
      step: 'location',
      imageGps: gps
    })
  }, [])

  useEffect(() => {
    if (!context.image || context.image.mode !== 'new') return
    if (serverDraftSession) return
    if (isCreatingDraftRef.current) return

    const imageSelection = context.image

    let cancelled = false

    const createServerDraft = async () => {
      if (isCreatingDraftRef.current) return
      isCreatingDraftRef.current = true

      try {
        const response = await csrfFetch('/api/submissions/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: imageSelection.images.map((image: NewUploadedImage) => ({
              uploadedBucket: image.uploadedBucket,
              uploadedPath: image.uploadedPath,
              width: image.width,
              height: image.height,
            })),
            metadata: {
              primaryIndex: imageSelection.primaryIndex,
              faceDirections: context.faceDirections,
            },
          }),
        })

        const payload = await response.json().catch(() => ({} as {
          draft?: { id?: string; images?: Array<{ id: string; display_order: number }> }
          error?: string
        }))
        if (!response.ok || !payload?.draft?.id) {
          throw new Error(payload.error || 'Failed to initialize server draft')
        }

        const imageIds = (payload.draft.images || [])
          .sort((a: { id: string; display_order: number }, b: { id: string; display_order: number }) => a.display_order - b.display_order)
          .map((image: { id: string; display_order: number }) => image.id)

        if (!cancelled) {
          setServerDraftSession({ id: payload.draft.id, imageIds })
        }
      } catch {
        if (!cancelled) {
          addToast('Could not enable cloud autosave for this draft. Local autosave still works.', 'info')
        }
      } finally {
        isCreatingDraftRef.current = false
      }
    }

    void createServerDraft()
    return () => {
      cancelled = true
    }
  }, [context.image, context.faceDirections, serverDraftSession, addToast])

  useEffect(() => {
    if (!serverDraftSession) return
    if (!activeDraftKey) return

    const intervalId = window.setInterval(() => {
      if (serverDraftAutosaveInFlightRef.current) return
      if (isSubmittingRef.current) return

      const raw = draftStorageGetItem(activeDraftKey)
      if (!raw) return

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }

      const currentIndex = batchCurrentFace && batchCurrentFace > 0 ? batchCurrentFace - 1 : 0
      serverDraftRouteDataRef.current[currentIndex] = parsed

      const imagesPayload = serverDraftSession.imageIds.map((imageId, index) => ({
        id: imageId,
        display_order: index,
        route_data: serverDraftRouteDataRef.current[index] || {},
      }))

      const payloadSignature = JSON.stringify(imagesPayload)
      if (payloadSignature === serverDraftLastPayloadRef.current) return
      serverDraftLastPayloadRef.current = payloadSignature

      serverDraftAutosaveInFlightRef.current = true
      void csrfFetch(`/api/submissions/drafts/${serverDraftSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesPayload }),
      }).finally(() => {
        serverDraftAutosaveInFlightRef.current = false
      })
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [serverDraftSession, activeDraftKey, batchCurrentFace])

  const handleLocationConfirm = useCallback((gps: GpsData) => {
    setContext(prev => ({ ...prev, imageGps: gps }))
    setStep({
      step: 'faceDirection',
      imageGps: gps
    })
  }, [])

  const handleFaceDirectionConfirm = useCallback((faceDirections: FaceDirection[]) => {
    latestFaceDirectionsRef.current = faceDirections
    setContext(prev => ({ ...prev, faceDirections }))
    setStep({
      step: 'crag',
      imageGps: context.imageGps
    })
  }, [context.imageGps])

  const handleCragSelect = useCallback((crag: Crag) => {
    const draftKey = getRouteDraftKeyFromImageAndCrag(context.image, crag.id)

    setContext(prev => ({
      ...prev,
      crag: { id: crag.id, name: crag.name, latitude: crag.latitude, longitude: crag.longitude }
    }))
    // Go to climbType selection first, then to draw
    setStep({
      step: 'climbType',
      imageGps: context.imageGps,
      cragId: crag.id,
      cragName: crag.name,
      image: context.image!,
      draftKey: draftKey || undefined,
    })

    if (serverDraftSession) {
      const supabase = createClient()
      void supabase
        .from('submission_drafts')
        .update({ crag_id: crag.id })
        .eq('id', serverDraftSession.id)
    }
  }, [context.imageGps, context.image, serverDraftSession])

  const handleCragImageCanvasSelect = useCallback((selection: ImageSelection, crag: Crag) => {
    const draftKey = getRouteDraftKeyFromImageAndCrag(selection, crag.id)

    setContext((prev) => ({
      ...prev,
      image: selection,
      imageGps: null,
      faceDirections: [],
      crag: { id: crag.id, name: crag.name, latitude: crag.latitude, longitude: crag.longitude },
    }))

    setStep({
      step: 'climbType',
      imageGps: null,
      cragId: crag.id,
      cragName: crag.name,
      image: selection,
      draftKey: draftKey || undefined,
    })

    if (serverDraftSession) {
      const supabase = createClient()
      void supabase
        .from('submission_drafts')
        .update({ crag_id: crag.id })
        .eq('id', serverDraftSession.id)
    }
  }, [serverDraftSession])

  const handleClimbTypeSelect = useCallback((routeType: ClimbType) => {
    if (isSubmitting) return
    setSelectedRouteType(routeType)
    setContext(prev => ({ ...prev, routeType }))
    // Go to draw step with the selected climb type as default
    setStep({
      step: 'draw',
      imageGps: context.imageGps,
      cragId: context.crag!.id,
      cragName: context.crag!.name,
      image: context.image!,
      draftKey: ('draftKey' in step && step.draftKey) || undefined,
      defaultClimbType: routeType,
    })
  }, [context.image, context.crag, isSubmitting, step, context.imageGps])

  const handleRoutesUpdate = useCallback((routes: NewRouteData[]) => {
    latestRoutesRef.current = routes
    setContext(prev => ({ ...prev, routes }))
  }, [])

  const handleBack = useCallback(() => {
    setError(null)
    switch (step.step) {
      case 'image':
        setStep({ step: 'image' })
        break
      case 'location':
        setStep({ step: 'image' })
        break
      case 'cragImage':
        setStep({ step: 'image' })
        break
      case 'faceDirection':
        setStep({ step: 'location', imageGps: context.imageGps })
        break
      case 'crag':
        setStep({ step: 'faceDirection', imageGps: context.imageGps })
        break
      case 'draw':
        setStep({
          step: 'crag',
          imageGps: context.imageGps,
          cragId: context.crag?.id,
          cragName: context.crag?.name
        })
        break
      case 'climbType':
        if (context.image?.mode === 'crag-image') {
          setStep({ step: 'cragImage' })
          break
        }
        setStep({
          step: 'crag',
          imageGps: context.imageGps,
        })
        break
      case 'draw':
    }
  }, [step, context])

  const continueToNextFace = useCallback((faces: PendingFace[], processedFaces: number, totalFaces: number | null) => {
    if (faces.length === 0 || !context.crag) return false

    const [nextFace, ...restFaces] = faces
    const nextSelection: ImageSelection = {
      mode: 'crag-image',
      cragImageId: nextFace.cragImageId,
      imageUrl: nextFace.imageUrl,
      linkedImageId: null,
      width: nextFace.width,
      height: nextFace.height,
    }

    setPendingFaces(restFaces)
    setBatchCurrentFace(processedFaces + 1)
    setDrawSessionVersion((prev) => prev + 1)
    latestRoutesRef.current = []
    setRoutes([])
    setContext((prev) => ({
      ...prev,
      image: nextSelection,
      routes: [],
    }))
    setStep({
      step: 'draw',
      imageGps: context.imageGps,
      cragId: context.crag.id,
      cragName: context.crag.name,
      image: nextSelection,
      defaultClimbType: selectedRouteType || undefined,
    })

    addToast(`Saved face ${processedFaces}/${totalFaces || processedFaces + 1}. Now draw face ${processedFaces + 1}/${totalFaces || processedFaces + 1}.`, 'success')

    return true
  }, [addToast, context.crag, context.imageGps, selectedRouteType, setRoutes])

  async function handleSubmit(routeType?: ClimbType) {
    if (isSubmitting) return
    const routesToSubmit = context.routes.length > 0 ? context.routes : latestRoutesRef.current
    const stepImage = 'image' in step ? step.image : null
    const stepCragId = 'cragId' in step ? step.cragId : undefined
    const imageToSubmit = context.image || stepImage || null
    const cragIdToSubmit = context.crag?.id || stepCragId
    const faceDirectionsToSubmit = context.faceDirections.length > 0 ? context.faceDirections : latestFaceDirectionsRef.current

    if (!imageToSubmit || !cragIdToSubmit || routesToSubmit.length === 0) {
      setError('Incomplete submission data')
      return
    }

    setIsSubmitting(true)
    setIsFinalizingBatch(false)
    setError(null)

    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Please log in to submit routes')
        setIsSubmitting(false)
        return
      }

      const resolvedImageGps = resolveImageGps({ ...context, image: imageToSubmit })

      const payload = imageToSubmit.mode === 'new'
        ? {
            mode: 'new' as const,
            images: imageToSubmit.images.map((image, index) => ({
              ...image,
              gpsData: index === imageToSubmit.primaryIndex ? (resolvedImageGps || image.gpsData) : image.gpsData,
            })),
            primaryIndex: imageToSubmit.primaryIndex,
            faceDirections: faceDirectionsToSubmit,
            cragId: cragIdToSubmit,
            routes: routesToSubmit,
          }
        : imageToSubmit.mode === 'crag-image'
          ? {
              mode: 'crag_image' as const,
              cragImageId: imageToSubmit.cragImageId,
              routes: routesToSubmit,
            }
          : {
              mode: 'existing' as const,
              imageId: imageToSubmit.imageId,
              routes: routesToSubmit,
            }

      if (imageToSubmit.mode === 'new' && !payload.cragId) {
        setError('Please select a crag before submitting')
        setIsSubmitting(false)
        return
      }

      if (imageToSubmit.mode === 'new' && faceDirectionsToSubmit.length === 0) {
        setError('Please select at least one face direction before submitting')
        setIsSubmitting(false)
        return
      }

      const response = await csrfFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, routeType: routeType || 'sport' })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Submission failed')
      }

      const data = await response.json()

      if (imageToSubmit.mode === 'new') {
        const supplementaryIds = Array.isArray(data?.supplementaryCragImageIds)
          ? (data.supplementaryCragImageIds as string[])
          : []

        if (imageToSubmit.images.length > 1 && supplementaryIds.length > 0) {
          const supplementaryImages = imageToSubmit.images.filter((_, index) => index !== imageToSubmit.primaryIndex)
          const queuedFaces: PendingFace[] = supplementaryIds
            .map((cragImageId, index) => ({
              cragImageId,
              imageUrl: supplementaryImages[index]?.uploadedUrl || '',
              width: supplementaryImages[index]?.width ?? null,
              height: supplementaryImages[index]?.height ?? null,
            }))
            .filter((face) => !!face.cragImageId && !!face.imageUrl)

          if (queuedFaces.length > 0) {
            setBatchTotalFaces(1 + queuedFaces.length)
            setBatchCreatedClimbs((data?.climbsCreated as number) || 0)
            const moved = continueToNextFace(queuedFaces, 1, 1 + queuedFaces.length)
            if (moved) {
              setIsFinalizingBatch(false)
              setIsSubmitting(false)
              return
            }
          }
        }
      }

      if (imageToSubmit.mode === 'crag-image' && pendingFaces.length > 0 && batchCurrentFace && batchTotalFaces) {
        setBatchCreatedClimbs((prev) => prev + ((data?.climbsCreated as number) || 0))
        const moved = continueToNextFace(pendingFaces, batchCurrentFace, batchTotalFaces)
        if (moved) {
          setIsFinalizingBatch(false)
          setIsSubmitting(false)
          return
        }
      }

      setIsFinalizingBatch(true)

      if (activeDraftKey) {
        draftStorageRemoveItem(activeDraftKey)
        removeDraftIndexEntry(activeDraftKey)
      }

      setPendingFaces([])
      setBatchTotalFaces(null)
      setBatchCurrentFace(null)
      const totalClimbsCreated = batchCreatedClimbs + ((data?.climbsCreated as number) || 0)
      setBatchCreatedClimbs(0)

      if (serverDraftSession) {
        const supabase = createClient()
        void supabase
          .from('submission_drafts')
          .update({ status: 'submitted' })
          .eq('id', serverDraftSession.id)
        setServerDraftSession(null)
        serverDraftLastPayloadRef.current = ''
      }

      setStep({
        step: 'success',
        climbsCreated: totalClimbsCreated || data.climbsCreated,
        imageId: data.imageId
      })

      if (imageToSubmit.mode === 'new') {
        startModerationRejectionRealtime(user.id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Submission failed'
      setError(errorMessage)
      addToast(errorMessage, 'error')
      setIsFinalizingBatch(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  submitRoutesRef.current = handleSubmit

  const handleStartOver = () => {
    if (activeDraftKey) {
      draftStorageRemoveItem(activeDraftKey)
      removeDraftIndexEntry(activeDraftKey)
    }
    setContext({ crag: null, image: null, imageGps: null, faceDirections: [], routes: [], routeType: null })
    latestRoutesRef.current = []
    latestFaceDirectionsRef.current = []
    setSelectedRouteType(null)
    setPendingFaces([])
    setBatchTotalFaces(null)
    setBatchCurrentFace(null)
    setBatchCreatedClimbs(0)
    setIsFinalizingBatch(false)
    setDrawSessionVersion(0)
    setServerDraftSession(null)
    isCreatingDraftRef.current = false
    serverDraftRouteDataRef.current = {}
    serverDraftLastPayloadRef.current = ''
    setStep({ step: 'image' })
    setError(null)
  }

  const handleResumeDraft = useCallback(async () => {
    if (!resumableDraftEntry) {
      setError('No draft available to resume.')
      return
    }

    setIsResumingDraft(true)

    let image: ImageSelection

    if (resumableDraftEntry.image.mode === 'new') {
      try {
        const restoredImages = [...resumableDraftEntry.image.images]
        const signedUrlResponse = await fetch('/api/uploads/signed-urls/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objects: restoredImages.map((draftImage) => ({
              bucket: draftImage.uploadedBucket,
              path: draftImage.uploadedPath,
            })),
          }),
        })

        if (!signedUrlResponse.ok) {
          throw new Error('Unable to restore photo preview')
        }

        const signedData = await signedUrlResponse.json().catch(() => ({} as SignedUrlBatchResponse))
        const signedResults = Array.isArray(signedData.results) ? signedData.results : []
        const signedByKey = new Map<string, string>()

        for (const item of signedResults) {
          if (!item?.signedUrl) continue
          signedByKey.set(getSignedUrlBatchKey(item.bucket, item.path), item.signedUrl)
        }

        const signedImages = restoredImages.map((draftImage) => {
          const key = getSignedUrlBatchKey(draftImage.uploadedBucket, draftImage.uploadedPath)
          const signedUrl = signedByKey.get(key)
          if (!signedUrl) {
            throw new Error('Unable to restore photo preview')
          }

          return { ...draftImage, uploadedUrl: signedUrl }
        })


        image = {
          mode: 'new',
          images: signedImages,
          primaryIndex: resumableDraftEntry.image.primaryIndex,
        }
      } catch {
        setError('We could not restore this draft image. Please re-upload the photo to continue.')
        setIsResumingDraft(false)
        return
      }
    } else if (resumableDraftEntry.image.mode === 'existing') {
      image = {
        mode: 'existing',
        imageId: resumableDraftEntry.image.imageId,
        imageUrl: resumableDraftEntry.image.imageUrl,
      }
    } else {
      image = {
        mode: 'crag-image',
        cragImageId: resumableDraftEntry.image.cragImageId,
        imageUrl: resumableDraftEntry.image.imageUrl,
        linkedImageId: resumableDraftEntry.image.linkedImageId,
        width: resumableDraftEntry.image.width,
        height: resumableDraftEntry.image.height,
      }
    }

    setError(null)
    setContext(prev => ({
      ...prev,
      crag: resumableDraftEntry.crag,
      image,
      imageGps: resumableDraftEntry.imageGps,
      faceDirections: resumableDraftEntry.faceDirections,
      routes: [],
    }))
    setStep({
      step: 'draw',
      imageGps: resumableDraftEntry.imageGps,
      cragId: resumableDraftEntry.crag.id,
      cragName: resumableDraftEntry.crag.name,
      image,
      draftKey: resumableDraftEntry.draftKey,
    })
    setIsResumingDraft(false)
  }, [resumableDraftEntry])

  const handleDiscardDraft = useCallback(() => {
    if (!resumableDraftEntry) return

    draftStorageRemoveItem(resumableDraftEntry.draftKey)
    removeDraftIndexEntry(resumableDraftEntry.draftKey)
    setResumableDraftEntry(null)
    setResumableDraftRouteCount(0)
  }, [resumableDraftEntry])

  const renderStep = () => {
    switch (step.step) {
      case 'image':
        return (
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Upload Route Photo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Upload a photo of the route to begin. Photos containing people will be rejected. GPS location will be extracted to help find nearby crags.
            </p>
            {resumableDraftRouteCount > 0 && resumableDraftEntry && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  You have a saved draft with {resumableDraftRouteCount} route{resumableDraftRouteCount !== 1 ? 's' : ''}.
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <button
                    onClick={handleResumeDraft}
                    disabled={isResumingDraft}
                    className="text-sm font-medium text-amber-900 underline decoration-amber-700 underline-offset-2 hover:text-amber-700 dark:text-amber-100 dark:hover:text-amber-300"
                  >
                    {isResumingDraft ? 'Resuming...' : 'Resume draft'}
                  </button>
                  <button
                    onClick={handleDiscardDraft}
                    className="text-sm font-medium text-amber-800/80 hover:text-amber-900 dark:text-amber-200/80 dark:hover:text-amber-100"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            <ImagePicker
              onSelect={(selection, gpsData) => handleImageSelect(selection, gpsData)}
              showBackButton={false}
            />
            <button
              onClick={() => setStep({ step: 'cragImage' })}
              className="mt-4 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Use an uploaded crag image instead
            </button>
          </div>
        )

      case 'cragImage':
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to image options
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Choose Crag Image Canvas</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a crag and pick any uploaded crag image to draw new routes on it.
            </p>
            <CragImageCanvasPicker
              onSelect={(selection, crag) => handleCragImageCanvasSelect(selection, crag)}
            />
          </div>
        )

      case 'location':
        const locationStep = step as { imageGps: { latitude: number; longitude: number } | null }
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to image
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Set Route Location</h2>
            <LocationPicker
              initialGps={locationStep.imageGps}
              onConfirm={handleLocationConfirm}
            />
          </div>
        )

      case 'faceDirection':
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to location
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Set Face Direction</h2>
            <FaceDirectionPicker
              gps={context.imageGps}
              images={context.image?.mode === 'new' ? context.image.images : []}
              activeImageIndex={context.image?.mode === 'new' ? context.image.primaryIndex : 0}
              initialFaceDirections={context.faceDirections}
              onConfirm={handleFaceDirectionConfirm}
            />
          </div>
        )

      case 'crag':
        const cragStep = step as { cragId?: string; cragName?: string }
        return (
          <div className="max-w-md mx-auto">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
            >
              ← Back to location
            </button>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select a Crag</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select or create a crag near your image location.
            </p>
            <CragSelector
              latitude={context.imageGps?.latitude ?? null}
              longitude={context.imageGps?.longitude ?? null}
              onSelect={handleCragSelect}
              selectedCragId={cragStep.cragId}
            />
          </div>
        )

      case 'draw':
        return (
          <div className="h-[calc(100svh-4rem)] md:h-[calc(100vh-64px)] touch-none overflow-hidden overscroll-none">
            {batchTotalFaces && batchCurrentFace ? (
              <div className="mx-auto mb-2 max-w-md rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                Face {batchCurrentFace} of {batchTotalFaces}
              </div>
            ) : null}
            {isFinalizingBatch ? (
              <div className="mx-auto mb-2 max-w-md rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                Finalizing submission...
              </div>
            ) : null}
            <RouteCanvas
              key={`${stepDraftKey || routeDraftKey || 'route-canvas'}:${drawSessionVersion}`}
              imageSelection={step.image}
              onRoutesUpdate={handleRoutesUpdate}
              onSubmitRoutes={() => {
                void handleSubmit(selectedRouteType || undefined)
              }}
              draftKey={stepDraftKey || routeDraftKey || undefined}
              defaultClimbType={step.defaultClimbType}
            />
          </div>
        )

        case 'climbType':
          return (
            <div className="max-w-md mx-auto">
              <button
                onClick={handleBack}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Select Climb Type</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                What type of climbing are these routes?
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { type: 'sport' as const, label: 'Sport' },
                  { type: 'boulder' as const, label: 'Boulder' },
                  { type: 'trad' as const, label: 'Trad' },
                  { type: 'deep-water-solo' as const, label: 'Deep Water Solo' }
                ].map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => handleClimbTypeSelect(type)}
                    disabled={isSubmitting}
                    className={`p-4 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors capitalize text-gray-900 dark:text-gray-100 ${
                      isSubmitting
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-500 dark:hover:border-blue-500'
                    }`}
                  >
                    {isSubmitting && selectedRouteType === type ? 'Submitting...' : label}
                  </button>
                ))}
              </div>
            </div>
          )

      case 'success':
        return (
          <div className="max-w-md mx-auto text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Routes Submitted!</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {step.climbsCreated} route{step.climbsCreated !== 1 ? 's' : ''} visible on map. After 3 community verifications, they&apos;ll be marked as verified.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                You can edit all your submissions in your <Link href="/logbook" className="text-blue-600 dark:text-blue-400 hover:underline">logbook</Link>.
              </p>
            </div>

            {step.imageId && (
              <div className="mb-6">
                <SubmissionCredit imageId={step.imageId} />
              </div>
            )}

            <button
              onClick={handleStartOver}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors mb-4"
            >
              Submit More Routes
            </button>

            {step.imageId && (
              <Link
                href={`/image/${step.imageId}`}
                className="block w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors mb-4"
              >
                View Routes on Image →
              </Link>
            )}

            <Link
              href="/logbook"
              className="block w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors mb-4"
            >
              Go to Logbook →
            </Link>

            <Link
              href="/"
              className="block text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              ← Back to Map
            </Link>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {renderStep()}
      </main>
    </div>
  )
}

export default function SubmitClient() {
  return <SubmitPageContent />
}
