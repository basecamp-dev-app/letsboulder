// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, expect, it } from 'vitest'

import { OpenDataConsentProvider } from '@/features/legal/components/OpenDataConsentProvider'
import { useOpenDataConsent } from '@/features/legal/hooks/use-open-data-consent'

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  status: vi.fn(),
}))

vi.mock('@/features/legal/actions/open-data-consent', () => ({
  acceptOpenDataConsentAction: mocks.accept,
  getOpenDataConsentStatusAction: mocks.status,
}))

function ContributionButton({ onContribute }: { onContribute: () => void }) {
  const { requireConsent } = useOpenDataConsent()
  return <button type="button" onClick={() => { void requireConsent(onContribute) }}>Contribute</button>
}

describe('OpenDataConsentProvider', () => {
  it('interrupts once, records consent, and resumes the pending contribution', async () => {
    const onContribute = vi.fn()
    mocks.status.mockResolvedValue({
      success: true,
      data: { requiredVersion: '2026-07-29-v1', acceptedVersion: null, consentTimestamp: null, isValid: false },
    })
    mocks.accept.mockResolvedValue({
      success: true,
      data: { requiredVersion: '2026-07-29-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: true },
    })

    render(<OpenDataConsentProvider><ContributionButton onContribute={onContribute} /></OpenDataConsentProvider>)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(await screen.findByRole('heading', { name: 'Keep climbing knowledge open' })).toBeInTheDocument()
    expect(onContribute).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(mocks.accept).toHaveBeenCalledWith('2026-07-29-v1')
    expect(onContribute).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(onContribute).toHaveBeenCalledTimes(2)
    expect(mocks.status).toHaveBeenCalledTimes(1)
  })
})
