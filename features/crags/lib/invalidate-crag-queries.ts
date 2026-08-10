'use client'

import type { QueryClient } from '@tanstack/react-query'
import { cragKeys } from '@/features/crags/lib/crag-queries'

export function invalidateCragQueries(queryClient: QueryClient, cragId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: cragKeys.images(cragId) }),
    queryClient.invalidateQueries({ queryKey: cragKeys.routes(cragId) }),
  ])
}
