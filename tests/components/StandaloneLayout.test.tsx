import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SkipLink from '@/components/SkipLink'
import StandaloneLayout from '@/components/StandaloneLayout'

let pathname = '/privacy'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

describe('standalone route shells', () => {
  beforeEach(() => {
    pathname = '/privacy'
    window.history.replaceState(null, '', '/')
  })

  it('provides one main landmark, return path, and labelled legal navigation', () => {
    render(
      <StandaloneLayout showLegalNavigation>
        <h1>Privacy Policy</h1>
      </StandaloneLayout>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('link', { name: /back to letsboulder/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('navigation', { name: /legal navigation/i })).toBeInTheDocument()
    const privacyLinks = screen.getAllByRole('link', { name: 'Privacy' })
    expect(privacyLinks).toHaveLength(2)
    expect(privacyLinks.every((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('moves focus to the main landmark when the skip link is activated', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SkipLink />
        <main id="main-content" tabIndex={-1}>Content</main>
      </>,
    )

    await user.click(screen.getByRole('link', { name: /skip to main content/i }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('#main-content')
  })
})
