'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { fetchOwnSubmissions } from '@/lib/submissions/fetch-own-submissions'
import type { Submission } from '@/types/submissions'

export function useSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setSubmissions([])
        setError('Authentication required')
        return
      }

      const next = await fetchOwnSubmissions(supabase, user.id, csrfFetch, 24)
      setSubmissions(next)
    } catch {
      setError('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteDraft = useCallback(async (draftId: string) => {
    setDeletingDraftId(draftId)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, { method: 'DELETE' })
      if (response.status === 404) {
        await refresh()
        return true
      }

      if (!response.ok) {
        throw new Error('Failed to delete draft')
      }

      setSubmissions((previous) => previous.filter((submission) => submission.id !== draftId))
      await refresh()
      return true
    } catch {
      return false
    } finally {
      setDeletingDraftId(null)
    }
  }, [refresh])

  const publishDraft = useCallback(async (draftId: string) => {
    setPublishingDraftId(draftId)
    try {
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}/promote`, { method: 'POST' })
      const payload = await response.json().catch(() => ({} as {
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
      }))
      if (!response.ok) {
        throw new Error('Failed to publish draft')
      }

      await refresh()
      const imageIds = Array.isArray(payload.published?.imageIds) ? payload.published.imageIds : []
      const routeLineIds = Array.isArray(payload.published?.routeLineIds) ? payload.published.routeLineIds : []
      return {
        ok: true,
        imageId: payload.published?.imageId || null,
        imageCount: imageIds.length > 0 ? imageIds.length : (payload.published?.imageId ? 1 : 0),
        routeCount: routeLineIds.length,
      }
    } catch {
      return {
        ok: false,
        imageId: null,
        imageCount: 0,
        routeCount: 0,
      }
    } finally {
      setPublishingDraftId(null)
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    submissions,
    loading,
    error,
    deletingDraftId,
    publishingDraftId,
    refresh,
    deleteDraft,
    publishDraft,
  }
}
