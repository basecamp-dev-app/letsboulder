// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLazyAuthUser } from '@/components/use-lazy-auth-user'

type AuthCallback = (_event: string, session: { user: { id: string } } | null) => void

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('useLazyAuthUser', () => {
  let authCallback: AuthCallback

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
      authCallback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  it('keeps an auth event received while the bootstrap request is pending', async () => {
    const bootstrap = deferred<{ data: { user: { id: string } } }>()
    mocks.getUser.mockReturnValue(bootstrap.promise)
    const { result } = renderHook(() => useLazyAuthUser())
    let loadPromise!: Promise<void>

    act(() => {
      loadPromise = result.current.load()
    })

    expect(mocks.onAuthStateChange).toHaveBeenCalledOnce()
    act(() => authCallback('SIGNED_IN', { user: { id: 'user-2' } }))

    await act(async () => {
      bootstrap.resolve({ data: { user: { id: 'user-1' } } })
      await loadPromise
    })

    expect(result.current.user?.id).toBe('user-2')
    expect(result.current.status).toBe('ready')
  })

  it('increments the auth revision synchronously when the account changes', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { result } = renderHook(() => useLazyAuthUser())

    await act(async () => { await result.current.load() })
    expect(result.current.getAuthRevision()).toBe(1)

    act(() => authCallback('SIGNED_IN', { user: { id: 'user-2' } }))
    expect(result.current.getAuthRevision()).toBe(2)

    act(() => authCallback('TOKEN_REFRESHED', { user: { id: 'user-2' } }))
    expect(result.current.getAuthRevision()).toBe(2)
  })
})
