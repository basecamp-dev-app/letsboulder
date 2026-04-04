'use client'

import { useCallback, useEffect, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import { createClient } from '@/lib/supabase'
import type { Submission } from '@/types/submissions'

export function useSubmissionsQuery() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    submissions,
    setSubmissions,
    loading,
    error,
    refresh,
  }
}
