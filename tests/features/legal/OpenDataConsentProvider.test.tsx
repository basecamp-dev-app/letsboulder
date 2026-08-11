// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi, describe, expect, it } from 'vitest'

import { OpenDataConsentProvider } from '@/features/legal/components/OpenDataConsentProvider'
import { useOpenDataConsent } from '@/features/legal/hooks/use-open-data-consent'

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  status: vi.fn(),
}))

vi.mock('@/features/legal/actions/open-data-consent', () => ({
  acceptOpenDataConsentAction: mocks.accept,
  getOpenDataConsentStatusAction: mocks.status,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}))

function ContributionButton({ onContribute }: { onContribute: () => void }) {
  const { requireConsent } = useOpenDataConsent()
  return <button type="button" onClick={() => { void requireConsent(onContribute) }}>Contribute</button>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('OpenDataConsentProvider', () => {
  let onAuthStateChange: (_event: string, session: { user: { id: string } } | null) => void

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.onAuthStateChange.mockImplementation((callback) => {
      onAuthStateChange = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  it('interrupts once, records consent, and resumes the pending contribution', async () => {
    const onContribute = vi.fn()
    mocks.status
      .mockResolvedValueOnce({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: null, consentTimestamp: null, isValid: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: true },
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
    expect(mocks.status).toHaveBeenCalledTimes(2)
  })

  it('requires acceptance when the terms version rolls out', async () => {
    const onContribute = vi.fn()
    mocks.status
      .mockResolvedValueOnce({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: true },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { requiredVersion: '2026-08-10-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: false },
      })

    render(<OpenDataConsentProvider><ContributionButton onContribute={onContribute} /></OpenDataConsentProvider>)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(onContribute).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(await screen.findByText(/2026-08-10-v1/)).toBeInTheDocument()
    expect(onContribute).toHaveBeenCalledTimes(1)
    expect(mocks.status).toHaveBeenCalledTimes(2)
  })

  it('does not submit a prior terms version after a status request fails', async () => {
    const onContribute = vi.fn()
    mocks.status
      .mockResolvedValueOnce({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: null, consentTimestamp: null, isValid: false },
      })
      .mockResolvedValueOnce({ success: false, error: 'Could not check contribution terms', status: 500 })

    render(<OpenDataConsentProvider><ContributionButton onContribute={onContribute} /></OpenDataConsentProvider>)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(await screen.findByText(/2026-07-29-v1/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check contribution terms')
    expect(screen.queryByText(/2026-07-29-v1/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not identify the current contribution terms')
    expect(mocks.accept).not.toHaveBeenCalled()
    expect(onContribute).not.toHaveBeenCalled()
  })

  it('discards a status result when the authenticated account changes', async () => {
    const onContribute = vi.fn()
    const status = deferred<{
      success: boolean
      data: { requiredVersion: string; acceptedVersion: string | null; consentTimestamp: string | null; isValid: boolean }
    }>()
    mocks.status.mockReturnValueOnce(status.promise)

    render(<OpenDataConsentProvider><ContributionButton onContribute={onContribute} /></OpenDataConsentProvider>)
    const user = userEvent.setup()
    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1))
    await act(async () => {
      onAuthStateChange('SIGNED_IN', { user: { id: 'user-2' } })
      status.resolve({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: true },
      })
      await status.promise
    })

    expect(onContribute).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Keep climbing knowledge open' })).not.toBeInTheDocument()
  })

  it('discards an acceptance result when the authenticated account changes', async () => {
    const onContribute = vi.fn()
    const acceptance = deferred<{
      success: boolean
      data: { requiredVersion: string; acceptedVersion: string | null; consentTimestamp: string | null; isValid: boolean }
    }>()
    mocks.status.mockResolvedValue({
      success: true,
      data: { requiredVersion: '2026-07-29-v1', acceptedVersion: null, consentTimestamp: null, isValid: false },
    })
    mocks.accept.mockReturnValueOnce(acceptance.promise)

    render(<OpenDataConsentProvider><ContributionButton onContribute={onContribute} /></OpenDataConsentProvider>)
    const user = userEvent.setup()
    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'Contribute' }))
    await screen.findByRole('heading', { name: 'Keep climbing knowledge open' })
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('2026-07-29-v1'))

    await act(async () => {
      onAuthStateChange('SIGNED_IN', { user: { id: 'user-2' } })
      acceptance.resolve({
        success: true,
        data: { requiredVersion: '2026-07-29-v1', acceptedVersion: '2026-07-29-v1', consentTimestamp: '2026-07-29T00:00:00Z', isValid: true },
      })
      await acceptance.promise
    })

    expect(onContribute).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Keep climbing knowledge open' })).not.toBeInTheDocument()
  })
})
