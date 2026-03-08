'use client'

import { useEffect } from 'react'
import {
  canRetryChunkReload,
  markChunkReloadAttempt,
  shouldReloadForChunkError,
} from '@/lib/offline/service-worker-client'

export default function ChunkLoadRecovery() {
  useEffect(() => {
    const reloadIfNeeded = (value: unknown) => {
      if (!shouldReloadForChunkError(value) || !canRetryChunkReload()) return
      markChunkReloadAttempt()
      window.location.reload()
    }

    const handleError = (event: ErrorEvent) => {
      reloadIfNeeded(event.error)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reloadIfNeeded(event.reason)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
