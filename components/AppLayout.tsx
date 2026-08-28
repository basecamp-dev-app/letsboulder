'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSubmitPage = pathname === '/submit'
  const isImmersiveMobilePage = /^\/logbook\/(drafts|submissions)\/[^/]+\/edit$/.test(pathname)
  const [isOffline, setIsOffline] = useState(false)
  const isOfflineFieldPage = isOffline && (/^\/climb\//.test(pathname) || /^\/crag\//.test(pathname) || /^\/[a-z]{2}\//.test(pathname))
  const hideFooter = isSubmitPage || isImmersiveMobilePage || isOfflineFieldPage

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
    document.documentElement.style.setProperty('--app-header-offset', '0px')
    document.documentElement.style.setProperty('--app-mobile-footer-offset', hideFooter ? '0px' : '4rem')

    return () => {
      document.documentElement.style.setProperty('--app-header-offset', '0px')
      document.documentElement.style.setProperty('--app-mobile-footer-offset', '4rem')
    }
  }, [hideFooter])

  return (
    <div className={hideFooter ? undefined : 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0'}>
      <Header />
      <main id="main-content" tabIndex={-1} className="min-h-screen focus:outline-none">
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  )
}
