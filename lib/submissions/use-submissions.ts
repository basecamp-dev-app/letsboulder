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
      if (!response.ok) {
        throw new Error('Failed to delete draft')
      }

      setSubmissions((previous) => previous.filter((submission) => submission.id !== draftId))
      return true
    } catch {
      return false
    } finally {
      setDeletingDraftId(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    submissions,
    loading,
    error,
    deletingDraftId,
    refresh,
    deleteDraft,
  }
}
