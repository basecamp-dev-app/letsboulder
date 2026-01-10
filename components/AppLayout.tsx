'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  return (
    <>
      <Header
        isFeedbackModalOpen={showFeedbackModal}
        onCloseFeedbackModal={() => setShowFeedbackModal(false)}
      />
      {children}
      <Footer onOpenFeedback={() => setShowFeedbackModal(true)} />
    </>
  )
}
