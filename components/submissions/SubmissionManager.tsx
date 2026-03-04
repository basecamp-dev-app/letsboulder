'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import SubmissionFlowView from '@/components/submissions/SubmissionFlowView'
import SubmissionListView from '@/components/submissions/SubmissionListView'

export default function SubmissionManager() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth?redirect_to=/logbook/submissions')
        return
      }

      setIsAuthenticated(true)
      setAuthChecked(true)
    }

    void checkAuth()
  }, [router])

  const mode = searchParams.get('mode')
  const draftId = searchParams.get('draftId')
  const isSubmitMode = mode === 'new' || !!draftId

  if (!authChecked) {
    return <div className="min-h-screen bg-white dark:bg-gray-950" />
  }

  if (!isAuthenticated) {
    return null
  }

  if (isSubmitMode) {
    return <SubmissionFlowView />
  }

  return <SubmissionListView />
}
