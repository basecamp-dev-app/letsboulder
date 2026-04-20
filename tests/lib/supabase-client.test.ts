import { beforeEach, describe, expect, it, vi } from 'vitest'

const createBrowserClient = vi.fn(() => ({ auth: {}, from: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createBrowserClient,
}))

describe('createClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  })

  it('creates a browser client with configured public env', async () => {
    const { createClient } = await import('@/lib/supabase')

    createClient()

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-test-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        }),
      })
    )
  })

  it('throws when public Supabase env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { createClient } = await import('@/lib/supabase')

    expect(() => createClient()).toThrow('Missing public Supabase environment variables')
    expect(createBrowserClient).not.toHaveBeenCalled()
  })
})
