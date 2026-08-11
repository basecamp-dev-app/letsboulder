'use client'

import { act, renderHook, waitFor } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

type AuthCallback = (_event: string, session: { user: { id: string } } | null) => void

const { csrfFetch, getUser, onAuthStateChange, removePersistedQueryCache, setDraftSignedUrlCacheUserId } = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  removePersistedQueryCache: vi.fn(),
  setDraftSignedUrlCacheUserId: vi.fn(),
}))

vi.mock('@/lib/csrf-client', () => ({ csrfFetch }))
vi.mock('@/lib/media/draft-signed-urls', () => ({ setDraftSignedUrlCacheUserId }))
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
    auth: { getUser, onAuthStateChange },
  })),
}))

import QueryProviders, { useSignOut } from '@/components/QueryProviders'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryProviders>{children}</QueryProviders>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('QueryProviders sign-out coordinator', () => {
  let authCallback: AuthCallback

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(csrfFetch).mockResolvedValue(new Response(null, { status: 200 }))
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    onAuthStateChange.mockImplementation((callback: AuthCallback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  test('does not replace an auth event with an older bootstrap response', async () => {
    const bootstrap = deferred<{ data: { user: { id: string } } }>()
    getUser.mockReturnValue(bootstrap.promise)

    renderHook(() => useQueryClient(), { wrapper })
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled())

    act(() => authCallback('SIGNED_IN', { user: { id: 'user-2' } }))
    await act(async () => {
      bootstrap.resolve({ data: { user: { id: 'user-1' } } })
      await bootstrap.promise
    })

    expect(setDraftSignedUrlCacheUserId).toHaveBeenLastCalledWith('user-2')
    expect(setDraftSignedUrlCacheUserId).not.toHaveBeenCalledWith('user-1')
    expect(removePersistedQueryCache).not.toHaveBeenCalledWith('user-2')
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
