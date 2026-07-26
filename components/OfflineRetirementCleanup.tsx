'use client'

import { useEffect, useRef } from 'react'
import { clearRegisteredServiceWorkers } from '@/lib/offline/service-worker-client'
import { clearStoredOfflinePackRecords } from '@/lib/offline/storage'

export default function OfflineRetirementCleanup() {
  const cleanupStartedRef = useRef(false)

  useEffect(() => {
    if (cleanupStartedRef.current) return
    cleanupStartedRef.current = true

    void Promise.all([
      clearRegisteredServiceWorkers(),
      clearStoredOfflinePackRecords(),
    ]).catch(() => {
      cleanupStartedRef.current = false
    })
  }, [])

  return null
}
