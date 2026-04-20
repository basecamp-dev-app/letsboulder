'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

type AuthLoadStatus = 'idle' | 'loading' | 'ready'

export function useLazyAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthLoadStatus>('idle')
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  const load = useCallback(async () => {
    if (status !== 'idle') return

    setStatus('loading')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null)
    })

    subscriptionRef.current = subscription
    setStatus('ready')
  }, [status])

  useEffect(() => () => {
    subscriptionRef.current?.unsubscribe()
    subscriptionRef.current = null
  }, [])

  return { user, status, load }
}
