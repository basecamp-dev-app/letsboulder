'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { FeedbackDialog } from './feedback-dialog'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        aria-label="Send feedback"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
