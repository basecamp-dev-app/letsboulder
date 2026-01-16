'use client'

import { useEffect } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { PostHogProvider, trackEvent } from '@/lib/posthog'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    trackEvent('app_loaded', {
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
    })
  }, [])

  return (
    <PostHogProvider>
      <Header />
      {children}
      <Footer />
    </PostHogProvider>
  )
}
