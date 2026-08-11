'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createIdbPersister, isCommunityQueryKey, removeLegacyPersistedQueryCache, removePersistedQueryCache } from '@/lib/query-persistence'
import { setDraftSignedUrlCacheUserId } from '@/lib/media/draft-signed-urls'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/lib/csrf-client'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const ANON_QUERY_CACHE_SCOPE = 'anon'
const SignOutContext = createContext<(() => Promise<boolean>) | null>(null)

export function useSignOut() {
  const signOut = useContext(SignOutContext)
  if (!signOut) throw new Error('useSignOut must be used within QueryProviders')
  return signOut
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60_000,
        gcTime: 10 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  })
}

export default function QueryProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [authScope, setAuthScope] = useState(ANON_QUERY_CACHE_SCOPE)
  const previousAuthScopeRef = useRef(authScope)
  const persister = useMemo(() => createIdbPersister(authScope), [authScope])

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    void removeLegacyPersistedQueryCache()
    let authStateChanged = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      authStateChanged = true
      if (!mounted) return
      setDraftSignedUrlCacheUserId(session?.user?.id ?? null)
      setAuthScope(session?.user?.id ?? ANON_QUERY_CACHE_SCOPE)
    })

    void supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      if (!mounted || authStateChanged) return
      setDraftSignedUrlCacheUserId(user?.id ?? null)
      setAuthScope(user?.id ?? ANON_QUERY_CACHE_SCOPE)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const previousAuthScope = previousAuthScopeRef.current
    if (previousAuthScope === authScope) return

    queryClient.clear()
    void removePersistedQueryCache(previousAuthScope)
    previousAuthScopeRef.current = authScope
  }, [authScope, queryClient])

  const signOut = async () => {
    const response = await csrfFetch('/api/auth/signout', { method: 'POST' })
    if (!response.ok) return false

    queryClient.clear()
    setDraftSignedUrlCacheUserId(null)
    await removePersistedQueryCache(authScope)
    previousAuthScopeRef.current = ANON_QUERY_CACHE_SCOPE
    setAuthScope(ANON_QUERY_CACHE_SCOPE)
    return true
  }

  return (
    <SignOutContext value={signOut}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: TWELVE_HOURS_MS,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => query.meta?.persist === true && !isCommunityQueryKey(query.queryKey),
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </SignOutContext>
  )
}
