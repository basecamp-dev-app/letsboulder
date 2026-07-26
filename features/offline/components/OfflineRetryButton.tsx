'use client'

import { Button } from '@/components/ui/button'

export default function OfflineRetryButton() {
  return (
    <Button type="button" className="rounded-xl" onClick={() => window.location.reload()}>
      Try again
    </Button>
  )
}
