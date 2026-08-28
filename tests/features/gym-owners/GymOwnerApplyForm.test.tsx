import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GymOwnerApplyForm from '@/features/gym-owners/components/GymOwnerApplyForm'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}))

vi.mock('@/features/gym-owners/actions', () => ({
  submitGymOwnerApplicationAction: mocks.submit,
}))

vi.mock('@/components/ui/Turnstile', () => ({
  default: ({ onVerify }: { onVerify: (token: string) => void }) => (
    <button type="button" onClick={() => onVerify('verified-token')}>Complete verification</button>
  ),
}))

async function completeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Gym name/), 'North Wall')
  await user.type(screen.getByLabelText(/^Address/), '1 Boulder Road')
  await user.type(screen.getByLabelText(/^City/), 'Sheffield')
  await user.type(screen.getByLabelText(/^Country/), 'United Kingdom')
  await user.type(screen.getByLabelText(/^Postcode \/ ZIP/), 'S1 1AA')
  await user.click(screen.getByLabelText('Boulder'))
  await user.type(screen.getByLabelText(/^Phone \(WhatsApp\)/), '+44 7700 900000')
  await user.type(screen.getByLabelText(/^Email/), 'owner@example.com')
  await user.click(screen.getByRole('button', { name: 'Complete verification' }))
}

describe('GymOwnerApplyForm', () => {
  beforeEach(() => {
    mocks.submit.mockReset()
  })

  it('explains required fields and leaves submission available for validation', () => {
    render(<GymOwnerApplyForm />)

    expect(screen.getByText(/Fields marked/)).toHaveTextContent('are required')
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeEnabled()
    expect(screen.getByLabelText(/^Gym name/)).toHaveAttribute('autocomplete', 'organization')
    expect(screen.getByLabelText(/^Address/)).toHaveAttribute('autocomplete', 'street-address')
    expect(screen.getByLabelText(/^City/)).toHaveAttribute('autocomplete', 'address-level2')
    expect(screen.getByLabelText(/^Country/)).toHaveAttribute('autocomplete', 'country-name')
    expect(screen.getByLabelText(/^Postcode \/ ZIP/)).toHaveAttribute('autocomplete', 'postal-code')
    expect(screen.getByLabelText(/^Phone \(WhatsApp\)/)).toHaveAttribute('autocomplete', 'tel')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
  })

  it('associates an invalid email error and focuses a summary for multiple errors', async () => {
    const user = userEvent.setup()
    render(<GymOwnerApplyForm />)

    const email = screen.getByLabelText(/^Email/)
    await user.type(email, 'not-an-email')
    await user.tab()

    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'contact-email-error')
    expect(screen.getByText('Enter a valid email address.')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Submit application' }))
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('Check 9 fields')
    await waitFor(() => expect(summary).toHaveFocus())
    await user.click(within(summary).getByRole('button', { name: /^Gym name:/ }))
    expect(screen.getByLabelText(/^Gym name/)).toHaveFocus()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('preserves entered data and provides retry steps after a server error', async () => {
    const user = userEvent.setup()
    mocks.submit.mockResolvedValue({ success: false, status: 500, error: 'Failed to submit application' })
    render(<GymOwnerApplyForm />)
    await completeForm(user)

    await user.click(screen.getByRole('button', { name: 'Submit application' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your details are still here')
    expect(screen.getByLabelText(/^Gym name/)).toHaveValue('North Wall')
    expect(screen.getByLabelText(/^Email/)).toHaveValue('owner@example.com')
    expect(screen.getByRole('button', { name: 'Try submitting again' })).toBeVisible()
    await waitFor(() => expect(alert).toHaveFocus())
  })

  it('announces a slow submission and preserves data after a network failure', async () => {
    const user = userEvent.setup()
    let rejectSubmission: ((reason?: unknown) => void) | undefined
    mocks.submit.mockImplementation(() => new Promise((_resolve, reject) => { rejectSubmission = reject }))
    render(<GymOwnerApplyForm />)
    await completeForm(user)

    await user.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(screen.getByRole('button', { name: 'Submitting application…' })).toBeDisabled()
    expect(screen.getByText('Please wait while your application is sent.')).toBeVisible()

    rejectSubmission?.(new Error('offline'))
    expect(await screen.findByText(/connection was interrupted/)).toBeVisible()
    expect(screen.getByLabelText(/^Gym name/)).toHaveValue('North Wall')
    expect(screen.getByLabelText(/^Email/)).toHaveValue('owner@example.com')
  })

  it('shows duplicate and success states with clear next steps', async () => {
    const user = userEvent.setup()
    mocks.submit.mockResolvedValueOnce({
      success: false,
      status: 409,
      error: 'An application for this gym has already been received. Contact us if you need to update it.',
    }).mockResolvedValueOnce({ success: true })
    render(<GymOwnerApplyForm />)
    await completeForm(user)

    await user.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText(/already been received/)).toBeVisible()
    expect(screen.getByLabelText(/^Gym name/)).toHaveValue('North Wall')

    await user.click(screen.getByRole('button', { name: 'Try submitting again' }))
    const success = await screen.findByRole('heading', { name: 'Application received' })
    expect(success).toHaveFocus()
    expect(screen.getByText(/contact you via WhatsApp with the next steps/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Submit another application' })).toBeVisible()
  })
})
