'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import RouteCanvas from '@/app/submit/components/RouteCanvas'
import { csrfFetch } from '@/hooks/useCsrf'
import { resolveRouteImageUrl } from '@/lib/route-image-url'
import { createClient } from '@/lib/supabase'
import type { ImageSelection, NewRouteData, RouteLine, RoutePoint } from '@/lib/submission-types'

interface EditableRoute {
  id: string
  name: string
  description?: string
  points: RoutePoint[]
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
    description: string | null
    user_id: string | null
  } | Array<{
    id: string
    name: string | null
    grade: string
    status: string
    description: string | null
    user_id: string | null
  }> | null
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
  const imageId = params.imageId as string

  const [loading, setLoading] = useState(true)
  const [savingEdits, setSavingEdits] = useState(false)
  const [savingNewRoutes, setSavingNewRoutes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null)
  const [existingRouteLines, setExistingRouteLines] = useState<RouteLine[]>([])
  const [editedRoutes, setEditedRoutes] = useState<EditableRoute[]>([])
  const [newRoutes, setNewRoutes] = useState<NewRouteData[]>([])
  const [canvasKey, setCanvasKey] = useState(0)

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
            route_lines (
              id,
              points,
              sequence_order,
              image_width,
              image_height,
              climbs (id, name, grade, status, description, user_id)
            )
        `)
        .eq('id', imageId)
        .single()

      if (imageError || !data) {
        setError('Failed to load this submission')
        return
      }

      if (data.created_by !== user.id) {
        setError('You can only edit your own submitted routes')
        return
      }

      const mappedRouteLines = ((data.route_lines as ImageRouteLineQuery[] | null) || [])
        .map((line) => {
          const climb = pickOne(line.climbs)
          if (!climb || climb.user_id !== user.id) return null

          const points = parsePoints(line.points)
          if (points.length < 2) return null

          return {
            id: line.id,
            image_id: data.id,
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
              description: climb.description,
            },
          } as RouteLine
        })
        .filter((line): line is RouteLine => line !== null)

      setImageSelection({
        mode: 'existing',
        imageId: data.id,
        imageUrl: resolveRouteImageUrl(data.url),
      })
      setExistingRouteLines(mappedRouteLines)
      setEditedRoutes([])
      setNewRoutes([])
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

  const handleCreateRoutes = useCallback(async () => {
    if (savingNewRoutes || !imageId || newRoutes.length === 0) return

    setSavingNewRoutes(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: newRoutes }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to add new routes')
      }

      setSuccess(`Added ${newRoutes.length} new route${newRoutes.length === 1 ? '' : 's'}.`)
      await loadSubmission()
      setCanvasKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add new routes')
    } finally {
      setSavingNewRoutes(false)
    }
  }, [savingNewRoutes, imageId, newRoutes, loadSubmission])

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
          <p className="text-xs text-gray-500 dark:text-gray-400">Grade remains community consensus</p>
        </div>

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

        {hasReadyData && imageSelection ? (
          <div className="h-[calc(100dvh-9rem)] md:h-[calc(100vh-7rem)] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
            <RouteCanvas
              key={canvasKey}
              imageSelection={imageSelection}
              onRoutesUpdate={setNewRoutes}
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
      </div>
    </div>
  )
}
