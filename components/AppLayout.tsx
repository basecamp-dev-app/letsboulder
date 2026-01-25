'use client'

import { useEffect } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { PostHogProvider, trackEvent } from '@/lib/posthog'
import { SubmitProvider, useSubmitContext } from '@/lib/submit-context'

function FooterWithSubmit() {
  const submitContext = useSubmitContext()
  return <Footer submitContext={submitContext} />
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    trackEvent('app_loaded', {
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
    })
  }, [])

  return (
    <PostHogProvider>
      <SubmitProvider>
        <Header />
        {children}
        <FooterWithSubmit />
      </SubmitProvider>
    </PostHogProvider>
  )
}
