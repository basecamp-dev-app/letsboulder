import { fireEvent, render, screen } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import SettingsContent from '@/app/(shell)/settings/components/SettingsContent'
import { useSettingsForm } from '@/features/settings/hooks/use-settings-form'

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}))

vi.mock('@/features/settings/hooks/use-settings-form', () => ({
  useSettingsForm: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toasts: [], addToast: vi.fn(), removeToast: vi.fn() }),
}))

describe('SettingsContent', () => {
  it('blocks editing and retries when settings fail before data is available', () => {
    const refetch = vi.fn()
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Unavailable'),
      refetch,
    } as never)
    vi.mocked(useSettingsForm).mockReturnValue({
      loading: true,
      toast: null,
      setToast: vi.fn(),
    } as never)

    render(<SettingsContent user={{ email: 'climber@example.com' } as never} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Settings could not be loaded')
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
