'use client'

import { useCallback, useRef, useState } from 'react'

import type { MapFailure } from '@/lib/map/map-failure'
import { generateErrorId, reportError } from '@/lib/errors'

interface ReportedMapFailure extends MapFailure {
  errorId: string
}

export function useMapFailureRecovery(location: string) {
  const [attempt, setAttempt] = useState(0)
  const [fatalFailure, setFatalFailure] = useState<ReportedMapFailure | null>(null)
  const [resourceFailure, setResourceFailure] = useState<ReportedMapFailure | null>(null)
  const [retrying, setRetrying] = useState(false)
  const lastSignatureRef = useRef<string | null>(null)

  const handleFailure = useCallback((failure: MapFailure) => {
    const signature = `${failure.kind}:${failure.severity}:${failure.error.message}`
    if (lastSignatureRef.current === signature) return
    lastSignatureRef.current = signature

    const errorId = generateErrorId()
    const reportedFailure = { ...failure, errorId }
    reportError(failure.error, {
      message: 'Map capability failure',
      tags: {
        error_id: errorId,
        location,
        map_failure_kind: failure.kind,
        map_failure_severity: failure.severity,
      },
      extra: { errorId },
      level: failure.severity === 'fatal' ? 'error' : 'warning',
    })

    if (failure.severity === 'fatal') {
      setFatalFailure(reportedFailure)
    } else {
      setResourceFailure(reportedFailure)
    }
  }, [location])

  const retry = useCallback(() => {
    lastSignatureRef.current = null
    setFatalFailure(null)
    setResourceFailure(null)
    setRetrying(true)
    setAttempt((current) => current + 1)
  }, [])

  const completeRetry = useCallback(() => {
    setRetrying(false)
  }, [])

  return { attempt, fatalFailure, resourceFailure, retrying, handleFailure, retry, completeRetry }
}
