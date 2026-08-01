import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HomeContributorHighlights from '@/features/home/components/HomeContributorHighlights'
import type { HomeContributorHighlight, HomeRecentClimbLog } from '@/features/home/server/homepage-data'

const contributor: HomeContributorHighlight = {
  userId: 'user-1',
  href: '/logbook/jack-willis',
  displayName: 'Jack Willis',
  avatarUrl: 'https://example.com/jack.jpg',
  username: 'jack',
  contributedAt: '2026-08-01T10:00:00.000Z',
}

const climbLog: HomeRecentClimbLog = {
  logId: 'log-1',
  href: '/climb/small-chimney',
  profileHref: '/logbook/patrick-hadow',
  userId: 'user-2',
  displayName: 'Patrick Hadow',
  avatarUrl: 'https://example.com/patrick.jpg',
  username: 'patrick',
  loggedAt: '2026-08-01T11:00:00.000Z',
  style: 'top',
  climbName: 'Small Chimney',
  grade: '5A',
  cragName: 'Test Crag',
}

describe('HomeContributorHighlights', () => {
  it('replaces failed decorative avatars with initials without duplicating names', () => {
    const { container } = render(
      <HomeContributorHighlights recentContributors={[contributor]} recentClimbLogs={[climbLog]} />,
    )
    const avatars = container.querySelectorAll('img')

    expect(avatars).toHaveLength(2)
    expect(avatars[0]).toHaveAttribute('alt', '')
    expect(avatars[1]).toHaveAttribute('alt', '')

    fireEvent.error(avatars[0])
    fireEvent.error(avatars[1])

    expect(screen.getByText('JA')).toBeInTheDocument()
    expect(screen.getByText('PA')).toBeInTheDocument()
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.textContent?.match(/Jack Willis/g)).toHaveLength(1)
    expect(container.textContent?.match(/Patrick Hadow/g)).toHaveLength(1)
  })
})
