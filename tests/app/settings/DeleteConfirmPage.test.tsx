import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeleteConfirmPage from '@/app/(shell)/settings/delete-confirm/page'
import { csrfFetch } from '@/hooks/useCsrf'

const push = vi.fn()
let token: string | null = 'valid-token'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(token ? { token } : undefined),
}))

vi.mock('@/hooks/useCsrf', () => ({
  csrfFetch: vi.fn(),
}))

describe('DeleteConfirmPage', () => {
  beforeEach(() => {
    token = 'valid-token'
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.mocked(csrfFetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  })

  it('validates without deleting when the confirmation URL opens', async () => {
    render(<DeleteConfirmPage />)

    expect(await screen.findByRole('heading', { name: 'Permanently delete your account?' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/settings/delete?token=valid-token', {
      signal: expect.any(AbortSignal),
    })
    expect(csrfFetch).not.toHaveBeenCalled()
  })

  it('deletes only after the explicit confirmation action', async () => {
    render(<DeleteConfirmPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'Permanently delete account' }))

    await waitFor(() => {
      expect(csrfFetch).toHaveBeenCalledWith('/api/settings/delete?token=valid-token', {
        method: 'POST',
      })
    })
    expect(await screen.findByRole('heading', { name: 'Account Deleted' })).toBeInTheDocument()
  })

  it('does not offer deletion when the token is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }))

    render(<DeleteConfirmPage />)

    expect(await screen.findByText('Invalid or expired token')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Permanently delete account' })).not.toBeInTheDocument()
    expect(csrfFetch).not.toHaveBeenCalled()
  })
})
