import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RankingsPage } from '@/features/rankings/components'

const { getUser, onAuthStateChange, reportError } = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser, onAuthStateChange },
  }),
}))

vi.mock('@/lib/grades/preferences', () => ({
  useGradeSystem: () => 'font',
}))

vi.mock('@/lib/grade-display', () => ({
  formatGradeForDisplay: (grade: string) => grade,
}))

vi.mock('@/lib/errors', () => ({ reportError }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const leaderboard = [{
  rank: 1,
  user_id: 'user-1',
  username: 'Ada',
  avatar_url: null,
  avg_grade: '7A',
  climb_count: 12,
}]

function rankingsResponse() {
  return new Response(JSON.stringify({
    leaderboard,
    pagination: { page: 1, limit: 20, total_users: 1, total_pages: 1 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('RankingsPage', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: null } })
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    vi.mocked(fetch).mockResolvedValue(rankingsResponse())
  })

  it('renders leaderboard entries returned by the rankings API', async () => {
    render(<RankingsPage />)

    expect(await screen.findByRole('link', { name: 'Ada' })).toHaveAttribute('href', '/logbook/user-1')
    expect(screen.getByText('7A')).toBeInTheDocument()
    expect(screen.getByText('12 tops')).toBeInTheDocument()
  })

  it('requests rankings with updated filters', async () => {
    const user = userEvent.setup()
    render(<RankingsPage />)

    await screen.findByRole('link', { name: 'Ada' })
    await user.selectOptions(screen.getByLabelText('Country'), 'France')
    await user.click(screen.getByRole('button', { name: 'Female' }))
    await user.click(screen.getByRole('button', { name: 'Most Tops' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/rankings?gender=female&country=France&sort=tops&page=1&limit=20',
        { signal: expect.any(AbortSignal) },
      )
    })
  })

  it('retries after a failed request', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(rankingsResponse())

    render(<RankingsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: 'Ada' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { message: 'Failed to fetch leaderboard' })
  })
})
