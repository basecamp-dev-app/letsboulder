// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSavedCrag } from '@/features/saved/hooks/use-saved-crag'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  saveCragAction: vi.fn(),
  unsaveCragAction: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: mocks.maybeSingle,
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)

    return {
      auth: {
        getUser: mocks.getUser,
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => builder),
    }
  },
}))

vi.mock('@/features/saved/actions/save-crag', () => ({ saveCragAction: mocks.saveCragAction }))
vi.mock('@/features/saved/actions/unsave-crag', () => ({ unsaveCragAction: mocks.unsaveCragAction }))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useSavedCrag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mocks.maybeSingle.mockResolvedValue({ data: { crag_id: 'crag-1' }, error: null })
    mocks.saveCragAction.mockResolvedValue({ success: true, data: { cragId: 'crag-1' } })
    mocks.unsaveCragAction.mockResolvedValue({ success: true, data: { cragId: 'crag-1' } })
  })

  it('hydrates authenticated saved state through the browser client', async () => {
    const { result } = renderHook(() => useSavedCrag('crag-1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isHydrating).toBe(false))
    expect(result.current.isSaved).toBe(true)
    expect(result.current.isAnonymous).toBe(false)
  })

  it('rolls back optimistic state when a mutation fails', async () => {
    mocks.unsaveCragAction.mockResolvedValue({ success: false, error: 'Failed', status: 500 })
    const { result } = renderHook(() => useSavedCrag('crag-1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSaved).toBe(true))
    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('Failed')
    })
    await waitFor(() => expect(result.current.isSaved).toBe(true))
  })
})
