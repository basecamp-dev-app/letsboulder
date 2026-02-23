'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SubmitProvider } from '@/lib/submit-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubmitProvider>
      <Header />
      {children}
      <Footer />
    </SubmitProvider>
  )
}
