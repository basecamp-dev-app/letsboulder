'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createIdbPersister, isCommunityQueryKey, removeLegacyPersistedQueryCache, removePersistedQueryCache } from '@/lib/query-persistence'
import { setDraftSignedUrlCacheUserId } from '@/lib/media/draft-signed-urls'
import { createClient } from '@/lib/supabase'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const ANON_QUERY_CACHE_SCOPE = 'anon'

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

    void supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      if (!mounted) return
      setDraftSignedUrlCacheUserId(user?.id ?? null)
      setAuthScope(user?.id ?? ANON_QUERY_CACHE_SCOPE)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setDraftSignedUrlCacheUserId(session?.user?.id ?? null)
      setAuthScope(session?.user?.id ?? ANON_QUERY_CACHE_SCOPE)
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

  return (
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
  )
}
