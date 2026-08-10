'use client'

import { useEffect, useState } from 'react'
import type { Session, User, UserResponse } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

export function useRankingsUser() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()

    void supabase.auth.getUser().then(({ data }: UserResponse) => {
      setUser(data.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return user
}
