'use client'

import { usePathname } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SubmitProvider } from '@/lib/submit-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSubmitPage = pathname === '/submit'

  return (
    <SubmitProvider>
      <Header />
      <main id="main-content" className="min-h-screen">
        {children}
      </main>
      {!isSubmitPage && <Footer />}
    </SubmitProvider>
  )
}
