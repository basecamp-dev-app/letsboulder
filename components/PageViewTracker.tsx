'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/posthog'

export default function PageViewTracker() {
  useEffect(() => {
    trackEvent('$pageview', {
      $current_url: window.location.href,
      $pathname: window.location.pathname,
    })
  }, [])

  return null
}
