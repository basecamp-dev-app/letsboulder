'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type PollState = 'checking' | 'polling' | 'timeout' | 'error'

const POLL_INTERVAL_MS = 1500
const MAX_WAIT_MS = 15000

function SkeletonLoader() {
  return (
    <div className="w-full max-w-md space-y-4 p-8">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
      <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
    </div>
  )
}

export default function ImageRedirectPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const imageId = params?.id as string | undefined

  const [state, setState] = useState<PollState>('checking')
  const startTimeRef = useRef<number | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const resolvedRef = useRef(false)
  const mountedRef = useRef(false)

  const supabase = createClient()

  const tabParam = searchParams.get('tab')

  const navigateToClimb = useCallback((climbId: string, routeLineId: string) => {
    if (resolvedRef.current) return
    resolvedRef.current = true

    const next = new URLSearchParams()
    next.set('route', routeLineId)
    if (tabParam === 'tops' || tabParam === 'climb') {
      next.set('tab', tabParam)
    }
    router.push(`/climb/${climbId}?${next.toString()}`)
  }, [tabParam, router])

  const checkImageExists = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('images')
        .select('id')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        console.error('Error checking image exists:', error)
        return false
      }

      return !!data
    } catch (err) {
      console.error('Exception checking image exists:', err)
      return false
    }
  }, [supabase])

  const checkForRoute = useCallback(async () => {
    if (!imageId) return null

    try {
      const { data, error } = await supabase
        .from('route_lines')
        .select('id, climb_id')
        .eq('image_id', imageId)
        .not('climb_id', 'is', null)
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error checking route_lines:', error)
        return null
      }

      return data
    } catch (err) {
      console.error('Exception checking route_lines:', err)
      return null
    }
  }, [imageId, supabase])

  const startPolling = useCallback(() => {
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
    }

    const poll = async () => {
      if (resolvedRef.current || !mountedRef.current) return

      const now = Date.now()
      const elapsed = startTimeRef.current ? now - startTimeRef.current : 0

      if (elapsed >= MAX_WAIT_MS) {
        setState('timeout')
        router.replace('/')
        return
      }

      const result = await checkForRoute()

      if (resolvedRef.current || !mountedRef.current) return

      if (result?.climb_id) {
        navigateToClimb(result.climb_id, result.id)
        return
      }

      pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }

    pollingRef.current = setTimeout(poll, POLL_INTERVAL_MS)
  }, [checkForRoute, navigateToClimb, router])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!imageId) {
      console.log('[ImageRedirect] No imageId, skipping')
      return
    }

    console.log('[ImageRedirect] Starting with imageId:', imageId)

    const init = async () => {
      console.log('[ImageRedirect] Checking if image exists:', imageId)
      const imageExists = await checkImageExists(imageId)

      if (!mountedRef.current) return
      console.log('[ImageRedirect] Image exists:', imageExists)

      if (!imageExists) {
        console.log('[ImageRedirect] Image not found, redirecting to /')
        router.replace('/')
        return
      }

      console.log('[ImageRedirect] Checking for existing routes')
      const result = await checkForRoute()

      if (!mountedRef.current) return
      console.log('[ImageRedirect] Route result:', result)

      if (result?.climb_id) {
        console.log('[ImageRedirect] Found route, navigating to climb')
        navigateToClimb(result.climb_id, result.id)
        return
      }

      console.log('[ImageRedirect] No route found, starting polling')
      setState('polling')
      startPolling()
    }

    init()

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [imageId, checkImageExists, checkForRoute, navigateToClimb, startPolling, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <SkeletonLoader />
        {state === 'checking' && (
          <p className="text-gray-600 dark:text-gray-400">Loading routes...</p>
        )}
        {state === 'polling' && (
          <div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">Processing your routes...</p>
            <p className="text-sm text-gray-400">This may take a few seconds</p>
          </div>
        )}
        {state === 'timeout' && (
          <p className="text-gray-600 dark:text-gray-400">Routes not ready yet</p>
        )}
        {state === 'error' && (
          <p className="text-gray-600 dark:text-gray-400">Something went wrong</p>
        )}
      </div>
    </div>
  )
}
