import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthCallbackPage from '@/app/auth/callback/page'
import { reportError } from '@/lib/errors'

const mockGetSession = vi.fn()
const mockGetUser = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  }),
}))

vi.mock('@/lib/profile-rpc', () => ({
  getOwnProfile: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ data: { session: {} }, error: null })
    mockGetUser.mockRejectedValue(new Error('Completion failed'))
  })

  it('shows an error and reports a rejected completion flow', async () => {
    render(<AuthCallbackPage />)

    expect(await screen.findByRole('heading', { name: 'Sign-in Failed' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Unable to complete sign-in. Please try again or request a new magic link.')).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith(new Error('Completion failed'), { message: 'Auth callback failed' })
  })
})
