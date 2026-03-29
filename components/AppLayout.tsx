'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SubmitProvider } from '@/features/submissions/providers/submit-context'
import { MediaUploadManagerProvider } from '@/lib/media/media-upload-manager'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSubmitPage = pathname === '/submit'
  const isImmersiveMobilePage = /^\/logbook\/(drafts|submissions)\/[^/]+\/edit$/.test(pathname)
  const isOfflineLaunchPage = pathname === '/offline' || pathname === '/offline/library'
  const [isOffline, setIsOffline] = useState(false)
  const isOfflineFieldPage = isOffline && (/^\/climb\//.test(pathname) || /^\/crag\//.test(pathname) || /^\/[a-z]{2}\//.test(pathname))
  const hideHeader = isOfflineLaunchPage
  const hideFooter = isSubmitPage || isImmersiveMobilePage || isOfflineLaunchPage || isOfflineFieldPage

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateOnlineStatus = () => setIsOffline(window.navigator.onLine === false)
    updateOnlineStatus()

    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--app-header-offset', hideHeader ? '0px' : '4rem')
    document.documentElement.style.setProperty('--app-mobile-footer-offset', hideFooter ? '0px' : '4rem')

    return () => {
      document.documentElement.style.setProperty('--app-header-offset', '4rem')
      document.documentElement.style.setProperty('--app-mobile-footer-offset', '4rem')
    }
  }, [hideFooter, hideHeader])

  return (
    <SubmitProvider>
      <MediaUploadManagerProvider>
        {!hideHeader && <Header />}
        <main id="main-content" className="min-h-screen">
          {children}
        </main>
        {!hideFooter && <Footer />}
      </MediaUploadManagerProvider>
    </SubmitProvider>
  )
}
