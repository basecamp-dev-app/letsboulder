import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GradePicker from '@/features/grades/components/GradePicker'

vi.mock('@/features/grades/hooks/useGradeSystem', () => ({
  useGradePreferences: () => ({ boulder: 'font_scale', route: 'french', trad: 'french' }),
  getGradeSystemForClimbType: () => 'font_scale',
}))

describe('GradePicker', () => {
  it('does not select a browsed grade when cancelled', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSelect = vi.fn()

    render(
      <GradePicker
        isOpen
        onClose={onClose}
        onSelect={onSelect}
        currentGrade="6A"
        gradeSystem="font_scale"
      />
    )

    await user.click(screen.getByRole('button', { name: '7A' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('commits the pending grade once when saved', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSelect = vi.fn()

    render(
      <GradePicker
        isOpen
        onClose={onClose}
        onSelect={onSelect}
        currentGrade="6A"
        gradeSystem="font_scale"
      />
    )

    await user.click(screen.getByRole('button', { name: '7A' }))
    expect(onSelect).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save Grade' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('7A')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('resets the pending grade and search when reopened', async () => {
    const user = userEvent.setup()
    const props = {
      onClose: vi.fn(),
      onSelect: vi.fn(),
      currentGrade: '6A',
      gradeSystem: 'font_scale' as const,
    }
    const { rerender } = render(<GradePicker {...props} isOpen />)

    await user.click(screen.getByRole('button', { name: '7A' }))
    await user.type(screen.getByRole('textbox', { name: '' }), '7')
    rerender(<GradePicker {...props} isOpen={false} />)
    rerender(<GradePicker {...props} isOpen />)

    expect(screen.getByRole('textbox', { name: '' })).toHaveValue('')
    expect(screen.getByRole('button', { name: '6A' })).toHaveClass('bg-blue-50')
    expect(screen.getByRole('button', { name: '7A' })).not.toHaveClass('bg-blue-50')
  })
})
