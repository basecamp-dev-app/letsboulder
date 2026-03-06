'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { CsrfProvider } from '@/components/csrf-provider'
import { createIdbPersister } from '@/lib/query-persistence'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  })
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  const [persister] = useState(createIdbPersister)

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: TWELVE_HOURS_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.meta?.persist === true,
        },
      }}
    >
      <CsrfProvider />
      {children}
    </PersistQueryClientProvider>
  )
}
