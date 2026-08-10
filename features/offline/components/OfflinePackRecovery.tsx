'use client'

import { useEffect, useRef } from 'react'
import { offlinePackStore } from '@/features/offline/lib/offline-pack-store'

export default function OfflinePackRecovery() {
  const running = useRef(false)

  useEffect(() => {
    const recover = () => {
      if (running.current) return
      running.current = true
      void offlinePackStore.resume().catch(() => undefined).finally(() => { running.current = false })
    }
    recover()
    window.addEventListener('online', recover)
    window.addEventListener('visibilitychange', recover)
    window.addEventListener('pageshow', recover)
    return () => {
      window.removeEventListener('online', recover)
      window.removeEventListener('visibilitychange', recover)
      window.removeEventListener('pageshow', recover)
    }
  }, [])

  return null
}
