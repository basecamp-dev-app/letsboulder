import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateCragQueries } from '@/features/crags/lib/invalidate-crag-queries'
import { cragKeys } from '@/features/crags/lib/crag-queries'

describe('invalidateCragQueries', () => {
  it('invalidates image and route data for only the affected crag', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(cragKeys.images('crag-1'), { images: [] })
    queryClient.setQueryData(cragKeys.routes('crag-1'), { routes: [] })
    queryClient.setQueryData(cragKeys.images('crag-2'), { images: [] })

    await invalidateCragQueries(queryClient, 'crag-1')

    expect(queryClient.getQueryState(cragKeys.images('crag-1'))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(cragKeys.routes('crag-1'))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(cragKeys.images('crag-2'))?.isInvalidated).toBe(false)
  })
})
