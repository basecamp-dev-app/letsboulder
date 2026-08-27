'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { probeConnectivity } from '@/lib/offline/connectivity'

export type LiveConnectivity = 'checking' | 'online' | 'offline'

export function useConnectivity() {
  const [status, setStatus] = useState<LiveConnectivity>('checking')
  const requestSequence = useRef(0)

  const check = useCallback(async () => {
    const sequence = ++requestSequence.current
    setStatus((current) => current === 'online' ? current : 'checking')
    const reachable = await probeConnectivity()
    if (sequence === requestSequence.current) setStatus(reachable ? 'online' : 'offline')
    return reachable
  }, [])

  useEffect(() => {
    const markOffline = () => {
      requestSequence.current += 1
      setStatus('offline')
    }
    const verifyConnection = () => { void check() }
    const initialCheck = window.setTimeout(verifyConnection, 0)
    window.addEventListener('offline', markOffline)
    window.addEventListener('online', verifyConnection)
    window.addEventListener('pageshow', verifyConnection)
    document.addEventListener('visibilitychange', verifyConnection)
    return () => {
      window.clearTimeout(initialCheck)
      window.removeEventListener('offline', markOffline)
      window.removeEventListener('online', verifyConnection)
      window.removeEventListener('pageshow', verifyConnection)
      document.removeEventListener('visibilitychange', verifyConnection)
    }
  }, [check])

  return { status, check }
}
