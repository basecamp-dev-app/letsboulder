'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SubmitProvider } from '@/lib/submit-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSubmitPage = pathname === '/submit'
  const isImmersiveMobilePage = /^\/logbook\/(drafts|submissions)\/[^/]+\/edit$/.test(pathname)

  useEffect(() => {
    document.documentElement.style.setProperty('--app-mobile-footer-offset', isImmersiveMobilePage ? '0px' : '4rem')

    return () => {
      document.documentElement.style.setProperty('--app-mobile-footer-offset', '4rem')
    }
  }, [isImmersiveMobilePage])

  return (
    <SubmitProvider>
      <Header />
      <main id="main-content" className="min-h-screen">
        {children}
      </main>
      {!isSubmitPage && !isImmersiveMobilePage && <Footer />}
    </SubmitProvider>
  )
}
