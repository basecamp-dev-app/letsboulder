'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

type AuthLoadStatus = 'idle' | 'loading' | 'ready'

export function useLazyAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthLoadStatus>('idle')
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (status !== 'idle' || subscriptionRef.current) return

    setStatus('loading')
    const supabase = createClient()
    let authStateChanged = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      authStateChanged = true
      if (mountedRef.current) setUser(session?.user ?? null)
    })

    subscriptionRef.current = subscription
    const { data: { user } } = await supabase.auth.getUser()
    if (!mountedRef.current || subscriptionRef.current !== subscription) return

    if (!authStateChanged) setUser(user)
    setStatus('ready')
  }, [status])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      subscriptionRef.current?.unsubscribe()
      subscriptionRef.current = null
    }
  }, [])

  return { user, status, load }
}
