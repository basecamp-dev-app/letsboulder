'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Link2, Loader2, MapPin, Trash2, Users } from 'lucide-react'
import RouteCanvas from '@/app/submit/components/RouteCanvas'
import CragSelector from '@/app/submit/components/CragSelector'
import { ToastContainer, useToast } from '@/components/logbook/toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { csrfFetch } from '@/hooks/useCsrf'
import { normalizeSubmissionCreditHandle, normalizeSubmissionCreditPlatform, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import { FACE_DIRECTIONS, type Crag, type FaceDirection, type ImageSelection, type NewRouteData, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { createClient } from '@/lib/supabase'

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
  user_id: string
  crag_id: string | null
  status: string
  updated_at: string
  last_edited_by: string | null
  metadata: Record<string, unknown> | null
  crags: { name?: string; latitude?: number | null; longitude?: number | null } | Array<{ name?: string; latitude?: number | null; longitude?: number | null }> | null
  images: DraftImagePayload[]
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
  const searchParams = useSearchParams()
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
  const hasShownCollabToastRef = useRef(false)

  const loadDraft = useCallback(async () => {
    if (!draftId) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/submissions/drafts/${draftId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({} as { draft?: DraftPayload; isOwner?: boolean; error?: string }))
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
      setDraftUpdatedAt(nextDraft.updated_at)
      setConflict(null)
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
      if (typeof payload.isOwner === 'boolean') {
        setIsOwner(payload.isOwner)
      }
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

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null)
    })
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

  const saveDraft = useCallback(async () => {
    if (!draft || !draftUpdatedAt) return false
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

      const savePayload: DraftSavePayload = {
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
        current_data?: { last_updated_by_display_name?: string | null }
      }))

      if (!response.ok) {
        if (response.status === 409 && payload.code === 'draft_conflict') {
          const conflictPayload = payload as DraftConflictResponse
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
          ...(prev.metadata || {}),
          primaryIndex,
          faceDirectionsByImage,
          routeType,
          contributionCreditPlatform: normalizedHandle ? creditPlatform : null,
          contributionCreditHandle: normalizedHandle,
        },
      } : prev)
      setDraftUpdatedAt(payload.draft?.updated_at || new Date().toISOString())
      setConflict(null)
      setSuccess('Draft saved. Not published to the map.')
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
      return false
    } finally {
      setSavingDraft(false)
    }
  }, [draft, draftUpdatedAt, routesByImageId, routeType, creditHandle, creditPlatform, cragId, primaryIndex, faceDirectionsByImage, currentUserId])

  const publishDraft = useCallback(async () => {
    if (!draft || !isOwner) return
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
  }, [draft, isOwner, saveDraft, addToast, router])

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
                  disabled={publishingDraft || savingDraft || !cragId || !!conflict}
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

        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <span className="mr-2 inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-gray-700 dark:text-gray-100">
            Draft
          </span>
          {isOwner
            ? 'Only collaborators can see this draft. It is not on the map until you publish.'
            : 'You are collaborating on this draft. The owner must publish it to map.'}
        </div>

        {collaborationAdded ? (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit this draft.
          </div>
        ) : null}

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
