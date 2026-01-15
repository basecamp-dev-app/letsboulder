'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export default function ConfirmDeletionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestId = searchParams.get('request_id')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const checkAndShowConfirmation = async () => {
      if (!requestId) {
        setError('Missing request ID')
        setLoading(false)
        return
      }

      try {
        const { data: deletionRequest, error: fetchError } = await supabase
          .from('deletion_requests')
          .select('id, user_id, scheduled_at, cancelled_at, deleted_at')
          .eq('id', requestId)
          .is('deleted_at', null)
          .single()

        if (fetchError || !deletionRequest) {
          setError('Deletion request not found')
          setLoading(false)
          return
        }

        if (deletionRequest.cancelled_at) {
          setError('This deletion request has been cancelled')
          setLoading(false)
          return
        }

        if (deletionRequest.deleted_at) {
          setError('This account has already been deleted')
          setLoading(false)
          return
        }

        setLoading(false)
      } catch (err) {
        setError('Failed to load deletion request')
        setLoading(false)
      }
    }

    checkAndShowConfirmation()
  }, [requestId, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6 mx-auto">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Unable to Confirm</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{error}</p>
          <Button variant="outline" onClick={() => router.push('/')}>
            Return to Home
          </Button>
        </div>
      </div>
    )
  }

  return null
}
