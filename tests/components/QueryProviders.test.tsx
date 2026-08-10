'use client'

import { act, renderHook, waitFor } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { csrfFetch, removePersistedQueryCache } = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  removePersistedQueryCache: vi.fn(),
}))

vi.mock('@/lib/csrf-client', () => ({ csrfFetch }))
vi.mock('@/lib/query-persistence', () => ({
  createIdbPersister: vi.fn(() => ({
    persistClient: vi.fn(),
    restoreClient: vi.fn(),
    removeClient: vi.fn(),
  })),
  isCommunityQueryKey: vi.fn(() => false),
  removeLegacyPersistedQueryCache: vi.fn(),
  removePersistedQueryCache,
}))
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  })),
}))

import QueryProviders, { useSignOut } from '@/components/QueryProviders'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryProviders>{children}</QueryProviders>
}

describe('QueryProviders sign-out coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(csrfFetch).mockResolvedValue(new Response(null, { status: 200 }))
  })

  test('clears query memory and the authenticated persisted scope before resolving', async () => {
    const { result } = renderHook(() => ({ signOut: useSignOut(), queryClient: useQueryClient() }), { wrapper })

    await waitFor(() => expect(removePersistedQueryCache).toHaveBeenCalledWith('anon'))
    vi.mocked(removePersistedQueryCache).mockClear()
    result.current.queryClient.setQueryData(['private'], { value: 'secret' })

    await act(async () => {
      await expect(result.current.signOut()).resolves.toBe(true)
    })

    expect(csrfFetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' })
    expect(result.current.queryClient.getQueryData(['private'])).toBeUndefined()
    expect(removePersistedQueryCache).toHaveBeenCalledWith('user-1')
  })

  test('retains caches when server sign-out fails', async () => {
    vi.mocked(csrfFetch).mockResolvedValue(new Response(null, { status: 500 }))
    const { result } = renderHook(() => ({ signOut: useSignOut(), queryClient: useQueryClient() }), { wrapper })

    await waitFor(() => expect(removePersistedQueryCache).toHaveBeenCalledWith('anon'))
    vi.mocked(removePersistedQueryCache).mockClear()
    result.current.queryClient.setQueryData(['private'], { value: 'secret' })

    await act(async () => {
      await expect(result.current.signOut()).resolves.toBe(false)
    })

    expect(result.current.queryClient.getQueryData(['private'])).toEqual({ value: 'secret' })
    expect(removePersistedQueryCache).not.toHaveBeenCalled()
  })
})
