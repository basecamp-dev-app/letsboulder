'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import RouteCanvas from '@/app/submit/components/RouteCanvas'
import CragSelector from '@/app/submit/components/CragSelector'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { csrfFetch } from '@/hooks/useCsrf'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import { FACE_DIRECTIONS, type Crag, type FaceDirection, type ImageSelection, type NewRouteData, type RouteLine, type RoutePoint } from '@/lib/submission-types'

interface DraftImagePayload {
  id: string
  display_order: number
  route_data: Record<string, unknown> | null
  signed_url: string | null
  width: number | null
  height: number | null
}

interface DraftPayload {
  id: string
  crag_id: string | null
  status: string
  metadata: Record<string, unknown> | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
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
  description?: string
  points: RoutePoint[]
}

interface ManageFaceTab {
  imageId: string
  index: number
  label: string
  signedUrl: string
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

function sortFaceDirections(directions: FaceDirection[]): FaceDirection[] {
  return [...directions].sort((a, b) => FACE_DIRECTIONS.indexOf(a) - FACE_DIRECTIONS.indexOf(b))
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

export default function EditDraftPage() {
  const params = useParams()
  const router = useRouter()
  const { toasts, addToast, removeToast } = useToast()
  const draftId = params.draftId as string

  const [loading, setLoading] = useState(true)
  const [savingDraft, setSavingDraft] = useState(false)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [draft, setDraft] = useState<DraftPayload | null>(null)
  const [manageFaces, setManageFaces] = useState<ManageFaceTab[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [primaryIndex, setPrimaryIndex] = useState(0)
  const [faceDirectionsByImage, setFaceDirectionsByImage] = useState<Record<number, FaceDirection[]>>({})
  const [routesByImageId, setRoutesByImageId] = useState<Record<string, DraftRoute[]>>({})

  const [routeType, setRouteType] = useState<string>('sport')
  const [creditPlatform, setCreditPlatform] = useState<SubmissionCreditPlatform>('instagram')
  const [creditHandle, setCreditHandle] = useState('')
  const [cragId, setCragId] = useState<string | null>(null)
  const [selectedCrag, setSelectedCrag] = useState<Pick<Crag, 'id' | 'name' | 'latitude' | 'longitude'> | null>(null)
  const [showCragSelector, setShowCragSelector] = useState(false)

  const loadDraft = useCallback(async () => {
    if (!draftId) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/submissions/drafts/${draftId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({} as { draft?: DraftPayload; error?: string }))
      if (!response.ok || !payload?.draft) {
        throw new Error(payload.error || 'Failed to load draft')
      }

      const nextDraft = payload.draft
      const sortedImages = [...(nextDraft.images || [])]
        .sort((a, b) => a.display_order - b.display_order)
        .filter((image) => typeof image.signed_url === 'string' && !!image.signed_url)

      if (sortedImages.length === 0) {
        throw new Error('This draft has no accessible photos')
      }

      const metadata = nextDraft.metadata && typeof nextDraft.metadata === 'object' ? nextDraft.metadata : {}
      const metadataPrimaryIndex = typeof metadata.primaryIndex === 'number' ? metadata.primaryIndex : 0
      const nextPrimaryIndex = metadataPrimaryIndex >= 0 && metadataPrimaryIndex < sortedImages.length ? metadataPrimaryIndex : 0

      const nextFaceDirectionsByImage: Record<number, FaceDirection[]> = {}
      const metadataFaceDirectionsByImage = (metadata as { faceDirectionsByImage?: unknown }).faceDirectionsByImage
      if (metadataFaceDirectionsByImage && typeof metadataFaceDirectionsByImage === 'object' && !Array.isArray(metadataFaceDirectionsByImage)) {
        for (const [rawIndex, rawDirections] of Object.entries(metadataFaceDirectionsByImage)) {
          const index = Number(rawIndex)
          if (!Number.isInteger(index) || index < 0 || index >= sortedImages.length) continue
          if (!Array.isArray(rawDirections)) continue
          const normalized = FACE_DIRECTIONS.filter((direction) => rawDirections.includes(direction))
          if (normalized.length > 0) {
            nextFaceDirectionsByImage[index] = normalized
          }
        }
      }

      const fallbackDirections = Array.isArray((metadata as { faceDirections?: unknown }).faceDirections)
        ? (metadata as { faceDirections: unknown[] }).faceDirections
        : []
      if (Object.keys(nextFaceDirectionsByImage).length === 0 && fallbackDirections.length > 0) {
        const normalized = FACE_DIRECTIONS.filter((direction) => fallbackDirections.includes(direction))
        if (normalized.length > 0) {
          nextFaceDirectionsByImage[nextPrimaryIndex] = normalized
        }
      }

      const nextRoutesByImageId: Record<string, DraftRoute[]> = {}
      const nextManageFaces: ManageFaceTab[] = sortedImages.map((image, index) => {
        nextRoutesByImageId[image.id] = parseRoutesFromRouteData(image.route_data, image.width || 1200, image.height || 1200)
        const directions = nextFaceDirectionsByImage[index]
        const directionsLabel = Array.isArray(directions) && directions.length > 0 ? ` (${directions.join('/')})` : ''
        return {
          imageId: image.id,
          index,
          label: index === nextPrimaryIndex ? `Primary${directionsLabel}` : `Face ${index + 1}${directionsLabel}`,
          signedUrl: image.signed_url || '',
        }
      })

      const normalizedRouteType = typeof metadata.routeType === 'string' && metadata.routeType
        ? metadata.routeType
        : 'sport'

      const normalizedCreditPlatform = normalizeSubmissionCreditPlatform((metadata as { contributionCreditPlatform?: unknown }).contributionCreditPlatform)
      const normalizedCreditHandle = typeof (metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle === 'string'
        ? String((metadata as { contributionCreditHandle?: unknown }).contributionCreditHandle)
        : ''

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
      setManageFaces(nextManageFaces)
      setActiveImageId(nextManageFaces[nextPrimaryIndex]?.imageId || nextManageFaces[0]?.imageId || null)
      setPrimaryIndex(nextPrimaryIndex)
      setFaceDirectionsByImage(nextFaceDirectionsByImage)
      setRoutesByImageId(nextRoutesByImageId)
      setRouteType(normalizedRouteType)
      setCreditPlatform(normalizedCreditPlatform || 'instagram')
      setCreditHandle(normalizedCreditHandle)
      setCragId(nextDraft.crag_id)
      setSelectedCrag(nextCrag)
      setShowCragSelector(!nextDraft.crag_id)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load draft'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [draftId])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  const activeFace = useMemo(() => {
    if (!activeImageId) return null
    return manageFaces.find((face) => face.imageId === activeImageId) || null
  }, [activeImageId, manageFaces])
  const activeFaceId = activeFace?.imageId || null
  const activeFaceIndex = activeFace?.index ?? -1

  const activeRoutes = useMemo(() => {
    if (!activeFaceId) return []
    return routesByImageId[activeFaceId] || []
  }, [activeFaceId, routesByImageId])

  const existingRouteLines = useMemo(() => {
    return activeRoutes.map((route) => ({
      id: route.id,
      image_id: activeFaceId || 'draft-image',
      climb_id: route.id,
      points: route.points,
      color: 'red',
      sequence_order: route.sequenceOrder,
      image_width: route.imageWidth,
      image_height: route.imageHeight,
      created_at: new Date().toISOString(),
      climb: {
        id: route.id,
        name: route.name,
        grade: route.grade,
        status: 'draft',
        route_type: route.climbType || routeType,
        description: route.description || null,
      },
    } as RouteLine))
  }, [activeRoutes, activeFaceId, routeType])

  const imageSelection = useMemo<ImageSelection | null>(() => {
    if (!activeFace) return null
    return {
      mode: 'existing',
      imageId: activeFace.imageId,
      imageUrl: activeFace.signedUrl,
    }
  }, [activeFace])

  const handleEditRoutesUpdate = useCallback((routes: EditableRoute[]) => {
    if (!activeFaceId) return
    setRoutesByImageId((prev) => {
      const current = prev[activeFaceId] || []
      const previousById = new Map(current.map((route) => [route.id, route]))
      const mapped = routes.map((route, index) => {
        const previous = previousById.get(route.id)
        return {
          id: route.id,
          name: route.name,
          grade: previous?.grade || '6A',
          description: route.description,
          climbType: previous?.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: previous?.imageWidth || 1200,
          imageHeight: previous?.imageHeight || 1200,
        }
      })

      if (areDraftRoutesEqual(current, mapped)) return prev

      return {
        ...prev,
        [activeFaceId]: mapped,
      }
    })
  }, [activeFaceId, routeType])

  const handleCreateRoutes = useCallback((newRoutes: NewRouteData[]) => {
    if (!activeFaceId) return
    if (newRoutes.length === 0) return
    setRoutesByImageId((prev) => {
      const current = prev[activeFaceId] || []
      const appended = [
        ...current,
        ...newRoutes.map((route, index) => ({
          id: route.id,
          name: route.name,
          grade: route.grade,
          description: route.description,
          climbType: route.climbType || routeType,
          points: route.points,
          sequenceOrder: current.length + index,
          imageWidth: route.imageWidth,
          imageHeight: route.imageHeight,
        })),
      ]

      if (areDraftRoutesEqual(current, appended)) return prev

      return {
        ...prev,
        [activeFaceId]: appended,
      }
    })
    setSuccess(`Added ${newRoutes.length} new route${newRoutes.length === 1 ? '' : 's'} to this draft face.`)
  }, [activeFaceId, routeType])

  const handleDeleteRoute = useCallback(async (routeLineId: string) => {
    if (!activeFaceId) return
    setRoutesByImageId((prev) => {
      const current = prev[activeFaceId] || []
      const next = current
        .filter((route) => route.id !== routeLineId)
        .map((route, index) => ({ ...route, sequenceOrder: index }))

      if (areDraftRoutesEqual(current, next)) return prev

      return {
        ...prev,
        [activeFaceId]: next,
      }
    })
    setSuccess('Route removed from draft face.')
  }, [activeFaceId])

  const toggleFaceDirection = useCallback((direction: FaceDirection) => {
    if (activeFaceIndex < 0) return
    setFaceDirectionsByImage((prev) => {
      const current = prev[activeFaceIndex] || []
      const next = current.includes(direction)
        ? current.filter((value) => value !== direction)
        : [...current, direction]
      return {
        ...prev,
        [activeFaceIndex]: sortFaceDirections(next),
      }
    })
  }, [activeFaceIndex])

  const setActiveAsPrimary = useCallback(() => {
    if (activeFaceIndex < 0) return
    setPrimaryIndex(activeFaceIndex)
  }, [activeFaceIndex])

  const saveDraft = useCallback(async () => {
    if (!draft) return false
    setSavingDraft(true)
    setError(null)
    setSuccess(null)

    try {
      const imagesPayload = draft.images
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
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
            imageWidth: route.imageWidth,
            imageHeight: route.imageHeight,
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

      const normalizedHandle = normalizeSubmissionCreditHandle(creditHandle)
      if (creditHandle.trim().length > 0 && !normalizedHandle) {
        throw new Error('Invalid credit handle format')
      }

      const response = await csrfFetch(`/api/submissions/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: imagesPayload,
          cragId,
          metadata: {
            ...(draft.metadata || {}),
            primaryIndex,
            faceDirectionsByImage,
            routeType,
            contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
            contributionCreditHandle: normalizedHandle,
          },
        }),
      })

      const payload = await response.json().catch(() => ({} as { error?: string }))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save draft')
      }

      setDraft((prev) => prev ? {
        ...prev,
        metadata: {
          ...(prev.metadata || {}),
          primaryIndex,
          faceDirectionsByImage,
          routeType,
          contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
          contributionCreditHandle: normalizedHandle,
        },
      } : prev)
      setSuccess('Draft saved. Not published to the map.')
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      return false
    } finally {
      setSavingDraft(false)
    }
  }, [draft, routesByImageId, routeType, creditHandle, creditPlatform, cragId, primaryIndex, faceDirectionsByImage])

  const publishDraft = useCallback(async () => {
    if (!draft) return
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
        published?: { imageId?: string; imageIds?: string[]; routeLineIds?: string[] }
      }))

      if (!response.ok || !payload.published?.imageId) {
        throw new Error(payload.error || 'Failed to publish draft')
      }

      const imageCount = Array.isArray(payload.published.imageIds) ? payload.published.imageIds.length : 1
      const routeCount = Array.isArray(payload.published.routeLineIds) ? payload.published.routeLineIds.length : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} face${imageCount === 1 ? '' : 's'}.`, 'success')

      const query = new URLSearchParams({
        publishedFaces: String(imageCount),
        publishedRoutes: String(routeCount),
      })
      router.push(`/logbook/submissions/${payload.published.imageId}/edit?${query.toString()}`)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish draft')
    } finally {
      setPublishingDraft(false)
    }
  }, [draft, saveDraft, addToast, router])

  if (loading) {
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href="/logbook"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to logbook
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void saveDraft() }}
              disabled={savingDraft || publishingDraft}
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save draft
            </button>
            <button
              type="button"
              onClick={() => { void publishDraft() }}
              disabled={publishingDraft || savingDraft || !cragId}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {publishingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Publish
            </button>
          </div>
        </div>

        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <span className="mr-2 inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-gray-700 dark:text-gray-100">
            Draft
          </span>
          Only you can see this. It is not on the map until you publish.
        </div>

        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        ) : null}

        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manage all images</h2>
            {activeFace ? (
              <button
                type="button"
                onClick={setActiveAsPrimary}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Set current as primary
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {manageFaces.map((face) => {
              const isActive = face.imageId === activeImageId
              const isPrimary = face.index === primaryIndex
              return (
                <button
                  key={face.imageId}
                  type="button"
                  onClick={() => setActiveImageId(face.imageId)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  {isPrimary ? `Primary (${face.index + 1})` : `Face ${face.index + 1}`}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft metadata</h2>
          </div>
          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            {selectedCrag && !showCragSelector ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCrag.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedCrag.latitude !== 0 || selectedCrag.longitude !== 0
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
                latitude={selectedCrag?.latitude || null}
                longitude={selectedCrag?.longitude || null}
                onSelect={(crag) => {
                  setCragId(crag.id)
                  setSelectedCrag({
                    id: crag.id,
                    name: crag.name,
                    latitude: crag.latitude,
                    longitude: crag.longitude,
                  })
                  setShowCragSelector(false)
                  setSuccess('Crag selected for this draft.')
                }}
                onCreateNew={() => {
                  setShowCragSelector(false)
                }}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Route type default
              <select
                value={routeType}
                onChange={(event) => setRouteType(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="sport">Sport</option>
                <option value="boulder">Boulder</option>
                <option value="trad">Trad</option>
                <option value="deep-water-solo">Deep water solo</option>
              </select>
            </label>
          </div>
          {!cragId ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">Select a crag before publishing this draft.</p>
          ) : null}
        </div>

        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Face directions</h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FACE_DIRECTIONS.map((direction) => {
              const selected = activeFace ? (faceDirectionsByImage[activeFace.index] || []).includes(direction) : false
              return (
                <button
                  key={direction}
                  type="button"
                  onClick={() => toggleFaceDirection(direction)}
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
        </div>

        {imageSelection ? (
          <div className="h-[calc(100dvh-9rem)] md:h-[calc(100vh-7rem)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
            <RouteCanvas
              key={activeFace?.imageId || 'draft-canvas'}
              imageSelection={imageSelection}
              onRoutesUpdate={() => {}}
              existingRouteLines={existingRouteLines}
              mode="edit-existing"
              allowCreateRoutesInEditMode
              onEditRoutesUpdate={handleEditRoutesUpdate}
              onSaveEdits={() => Promise.resolve()}
              savingEdits={false}
              showEditSaveButton={false}
              onSaveNewRoutes={handleCreateRoutes}
              savingNewRoutes={false}
              onDeleteExistingRoute={handleDeleteRoute}
              deletingExistingRouteId={null}
              defaultClimbType={routeType === 'deep-water-solo' ? 'deep-water-solo' : routeType === 'boulder' ? 'boulder' : routeType === 'trad' ? 'trad' : 'sport'}
            />
          </div>
        ) : null}

        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contribution credit</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Platform
              <select
                value={creditPlatform}
                onChange={(event) => setCreditPlatform(event.target.value as SubmissionCreditPlatform)}
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
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Shown publicly as @{normalizeSubmissionCreditHandle(creditHandle) || 'handle'} after publish.
          </p>
        </div>
      </div>
    </div>
  )
}
