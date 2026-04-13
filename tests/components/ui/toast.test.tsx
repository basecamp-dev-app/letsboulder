import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toast } from '@/components/ui/toast'

describe('Toast', () => {
  it('announces errors assertively', () => {
    render(<Toast message="Save failed" type="error" onClose={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true')
  })

  it('announces non-errors politely', () => {
    render(<Toast message="Saved" type="success" onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true')
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument()
  })
})
