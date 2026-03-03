'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Link2, MapPin, Share2, Trash2, Users } from 'lucide-react'
import RouteCanvas from '@/app/submit/components/RouteCanvas'
import { csrfFetch } from '@/hooks/useCsrf'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { createClient } from '@/lib/supabase'
import { FACE_DIRECTIONS, type FaceDirection, type ImageSelection, type NewRouteData, type RouteLine, type RoutePoint } from '@/lib/submission-types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface EditableRoute {
  id: string
  name: string
  description?: string
  points: RoutePoint[]
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

interface ImageRouteLineQuery {
  id: string
  points: RoutePoint[] | string | null
  sequence_order: number
  image_width: number | null
  image_height: number | null
  climbs: {
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
    user_id: string | null
  } | Array<{
    id: string
    name: string | null
    grade: string
    status: string
    route_type: string | null
    description: string | null
    user_id: string | null
  }> | null
}

interface EditableImageQuery {
  id: string
  url: string
  created_by: string | null
  latitude: number | null
  longitude: number | null
  face_directions: string[] | null
  route_lines: ImageRouteLineQuery[] | null
}

const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const

function normalizeRouteType(value: string | null | undefined): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  const canonical = normalized === 'bouldering' ? 'boulder' : normalized
  if (!VALID_ROUTE_TYPES.includes(canonical as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }
  return canonical as (typeof VALID_ROUTE_TYPES)[number]
}

function parsePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
      .map((p) => ({ x: p.x, y: p.y }))
  } catch {
    return []
  }
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export default function EditSubmittedRoutesPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const imageId = params.imageId as string

  const [loading, setLoading] = useState(true)
  const [savingEdits, setSavingEdits] = useState(false)
  const [savingNewRoutes, setSavingNewRoutes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null)
  const [existingRouteLines, setExistingRouteLines] = useState<RouteLine[]>([])
  const [editedRoutes, setEditedRoutes] = useState<EditableRoute[]>([])
  const [canvasKey, setCanvasKey] = useState(0)
  const [latitude, setLatitude] = useState<string>('')
  const [longitude, setLongitude] = useState<string>('')
  const [faceDirections, setFaceDirections] = useState<FaceDirection[]>([])
  const [savingImageMeta, setSavingImageMeta] = useState(false)
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

  const loadSubmission = useCallback(async () => {
    if (!imageId) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        router.push(`/auth?redirect_to=${encodeURIComponent(`/logbook/submissions/${imageId}/edit`)}`)
        return
      }

      const { data, error: imageError } = await supabase
        .from('images')
        .select(`
          id,
          url,
          created_by,
          latitude,
          longitude,
          face_directions,
          route_lines (
            id,
            points,
            sequence_order,
            image_width,
            image_height,
            climbs (id, name, grade, status, route_type, description, user_id)
          )
        `)
        .eq('id', imageId)
        .single()

      if (imageError || !data) {
        setError('Failed to load this submission')
        return
      }

      const submission = data as EditableImageQuery

      if (submission.created_by !== user.id) {
        const { data: collaboratorAccess, error: collaboratorError } = await supabase
          .from('submission_collaborators')
          .select('image_id')
          .eq('image_id', imageId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (collaboratorError || !collaboratorAccess) {
          setError('You do not have access to edit this submission')
          return
        }
      }

      const mappedRouteLines = (submission.route_lines || [])
        .map((line) => {
          const climb = pickOne(line.climbs)
          if (!climb) return null

          const points = parsePoints(line.points)
          if (points.length < 2) return null

          return {
            id: line.id,
            image_id: submission.id,
            climb_id: climb.id,
            points,
            color: 'red',
            sequence_order: line.sequence_order,
            created_at: new Date().toISOString(),
            climb: {
              id: climb.id,
              name: climb.name,
              grade: climb.grade,
              status: climb.status,
              route_type: climb.route_type,
              description: climb.description,
            },
          } as RouteLine
        })
        .filter((line): line is RouteLine => line !== null)

      setImageSelection({
        mode: 'existing',
        imageId: submission.id,
        imageUrl: resolveRouteImageUrl(submission.url),
      })
      setLatitude(typeof submission.latitude === 'number' ? submission.latitude.toString() : '')
      setLongitude(typeof submission.longitude === 'number' ? submission.longitude.toString() : '')
      const submittedDirections = Array.isArray(submission.face_directions) ? submission.face_directions : []
      const normalizedDirections = FACE_DIRECTIONS.filter((direction) => submittedDirections.includes(direction))
      setFaceDirections(normalizedDirections)
      setOwnerUserId(typeof submission.created_by === 'string' ? submission.created_by : null)
      setExistingRouteLines(mappedRouteLines)
      setEditedRoutes([])
    } catch {
      setError('Failed to load this submission')
    } finally {
      setLoading(false)
    }
  }, [imageId, router])

  useEffect(() => {
    loadSubmission()
  }, [loadSubmission])

  const hasReadyData = useMemo(() => {
    return !!imageSelection
  }, [imageSelection])

  const preferredRouteType = useMemo(() => {
    const uniqueTypes = new Set<(typeof VALID_ROUTE_TYPES)[number]>()
    for (const routeLine of existingRouteLines) {
      const normalized = normalizeRouteType(routeLine.climb?.route_type)
      if (normalized) uniqueTypes.add(normalized)
    }

    if (uniqueTypes.size !== 1) return null
    return [...uniqueTypes][0]
  }, [existingRouteLines])

  const collaborationAdded = searchParams.get('collab') === 'added'

  const handleSaveEdits = useCallback(async () => {
    if (savingEdits || !imageId || editedRoutes.length === 0) return

    setSavingEdits(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/routes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: editedRoutes }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save route edits')
      }

      setSuccess('Saved route edits. Route slug URLs stay unchanged.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save route edits')
    } finally {
      setSavingEdits(false)
    }
  }, [savingEdits, imageId, editedRoutes])

  const handleCreateRoutes = useCallback(async (routesToCreate: NewRouteData[]) => {
    if (savingNewRoutes || !imageId || routesToCreate.length === 0) return

    setSavingNewRoutes(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: routesToCreate, routeType: preferredRouteType }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to add new routes')
      }

      setSuccess(`Added ${routesToCreate.length} new route${routesToCreate.length === 1 ? '' : 's'}.`)
      await loadSubmission()
      setCanvasKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add new routes')
    } finally {
      setSavingNewRoutes(false)
    }
  }, [savingNewRoutes, imageId, loadSubmission, preferredRouteType])

  const toggleFaceDirection = useCallback((direction: FaceDirection) => {
    setFaceDirections((prev) => {
      if (prev.includes(direction)) {
        return prev.filter((value) => value !== direction)
      }
      return [...prev, direction]
    })
  }, [])

  const handleSaveImageMetadata = useCallback(async () => {
    if (!imageId || savingImageMeta) return

    const parsedLatitude = latitude.trim() === '' ? null : Number(latitude)
    const parsedLongitude = longitude.trim() === '' ? null : Number(longitude)

    if (parsedLatitude !== null && (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90)) {
      setError('Latitude must be between -90 and 90')
      return
    }

    if (parsedLongitude !== null && (!Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180)) {
      setError('Longitude must be between -180 and 180')
      return
    }

    setSavingImageMeta(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          faceDirections,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update image metadata')
      }

      setSuccess('Saved location and face directions.')
      await loadSubmission()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update image metadata')
    } finally {
      setSavingImageMeta(false)
    }
  }, [imageId, savingImageMeta, latitude, longitude, faceDirections, loadSubmission])

  const loadCollaborators = useCallback(async () => {
    if (!imageId) return

    setLoadingCollaborators(true)
    try {
      const response = await fetch(`/api/submissions/${imageId}/collaborators`, { cache: 'no-store' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to load collaborators')
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
      setError(err instanceof Error ? err.message : 'Failed to load collaborators')
    } finally {
      setLoadingCollaborators(false)
    }
  }, [imageId])

  const handleCreateInvite = useCallback(async () => {
    if (!imageId || creatingInvite || !isOwner) return

    setCreatingInvite(true)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: null, expiresAt: null }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to create invite link')
      }

      const data = await response.json() as { invite?: { inviteUrl?: string } }
      const inviteUrl = data.invite?.inviteUrl || null
      setLatestInviteUrl(inviteUrl)
      setSuccess('Invite link created')
      await loadCollaborators()

      if (inviteUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        setSuccess('Invite link created and copied')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite link')
    } finally {
      setCreatingInvite(false)
    }
  }, [imageId, creatingInvite, isOwner, loadCollaborators])

  const handleCopyInvite = useCallback(async (inviteUrl: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setSuccess('Invite link copied')
    } catch {
      setError('Failed to copy invite link')
    }
  }, [])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    if (!imageId || !isOwner || revokingInviteId) return

    setRevokingInviteId(inviteId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/collaborators`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to revoke invite')
      }

      setSuccess('Invite revoked')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }, [imageId, isOwner, revokingInviteId, loadCollaborators])

  const handleRemoveCollaborator = useCallback(async (collaboratorUserId: string) => {
    if (!imageId || !isOwner || removingCollaboratorId) return

    setRemovingCollaboratorId(collaboratorUserId)
    setError(null)
    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/collaborators/${collaboratorUserId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to remove collaborator')
      }

      setSuccess('Collaborator removed')
      await loadCollaborators()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove collaborator')
    } finally {
      setRemovingCollaboratorId(null)
    }
  }, [imageId, isOwner, removingCollaboratorId, loadCollaborators])

  useEffect(() => {
    if (shareOpen) {
      loadCollaborators()
    }
  }, [shareOpen, loadCollaborators])

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500 dark:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href="/logbook"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ← Back to logbook
          </Link>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Grade remains community consensus</p>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        </div>

        {collaborationAdded && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            You&apos;ve been added as a collaborator. You can now edit routes and image metadata.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {success}
          </div>
        )}

        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Image location and face directions</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Latitude
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="e.g. 48.4049"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Longitude
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="e.g. 2.6920"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {FACE_DIRECTIONS.map((direction) => {
              const selected = faceDirections.includes(direction)
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

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSaveImageMetadata}
              disabled={savingImageMeta}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {savingImageMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save image metadata
            </button>
          </div>
        </div>

        {hasReadyData && imageSelection ? (
          <div className="h-[calc(100dvh-9rem)] md:h-[calc(100vh-7rem)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
            <RouteCanvas
              key={canvasKey}
              imageSelection={imageSelection}
              onRoutesUpdate={() => {}}
              existingRouteLines={existingRouteLines}
              mode="edit-existing"
              allowCreateRoutesInEditMode
              onEditRoutesUpdate={setEditedRoutes}
              onSaveEdits={handleSaveEdits}
              savingEdits={savingEdits}
              onSaveNewRoutes={handleCreateRoutes}
              savingNewRoutes={savingNewRoutes}
            />
          </div>
        ) : null}

        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share edit access</DialogTitle>
              <DialogDescription>
                Create a link for collaborators to edit routes, location, and face directions.
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
                    onClick={handleCreateInvite}
                    disabled={creatingInvite}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create new link
                  </button>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Only the owner can create invite links.</p>
                )}

                {latestInviteUrl && (
                  <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                    <p className="break-all text-gray-700 dark:text-gray-200">{latestInviteUrl}</p>
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(latestInviteUrl)}
                      className="mt-2 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Copy link
                    </button>
                  </div>
                )}

                {activeInvites.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {activeInvites.map((invite) => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : ''
                      const inviteUrl = `${origin}/api/submissions/collaborate/${invite.token}`
                      return (
                        <div key={invite.id} className="rounded-md border border-gray-200 p-2 text-xs dark:border-gray-700">
                          <p className="break-all text-gray-600 dark:text-gray-300">{inviteUrl}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyInvite(inviteUrl)}
                              className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              Copy
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(invite.id)}
                                disabled={revokingInviteId === invite.id}
                                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                              >
                                {revokingInviteId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                ) : collaborators.length === 0 ? (
                  <div className="space-y-2">
                    {ownerUserId && ownerProfile ? (
                      <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {ownerProfile.displayName} (Owner)
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm text-gray-500 dark:text-gray-400">No collaborators yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ownerUserId && ownerProfile ? (
                      <div className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {ownerProfile.displayName} (Owner)
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{ownerProfile.username ? `@${ownerProfile.username}` : 'No username'}</p>
                        </div>
                      </div>
                    ) : null}
                    {collaborators.map((collaborator) => {
                      const isOwnerRow = ownerUserId === collaborator.userId
                      return (
                        <div key={collaborator.userId} className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-2 dark:border-gray-700">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {collaborator.profile.displayName}
                              {isOwnerRow ? ' (Owner)' : ''}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{collaborator.profile.username ? `@${collaborator.profile.username}` : 'No username'}</p>
                          </div>
                          {isOwner && !isOwnerRow ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCollaborator(collaborator.userId)}
                              disabled={removingCollaboratorId === collaborator.userId}
                              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {removingCollaboratorId === collaborator.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Remove
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
