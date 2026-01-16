'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { trackEvent } from '@/lib/posthog'

export default function ProfileViewTracker() {
  const params = useParams()
  const userId = params.userId as string

  useEffect(() => {
    if (userId) {
      trackEvent('profile_viewed', {
        viewed_user_id: userId,
      })
    }
  }, [userId])

  return null
}
