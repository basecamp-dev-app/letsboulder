'use client'

import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SubmitProvider, useSubmitContext } from '@/lib/submit-context'

function FooterWithSubmit() {
  const submitContext = useSubmitContext()
  return <Footer submitContext={submitContext} />
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubmitProvider>
      <Header />
      {children}
      <FooterWithSubmit />
    </SubmitProvider>
  )
}
