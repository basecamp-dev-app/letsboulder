import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorBackButton } from '@/features/editor/components/EditorBackButton'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('EditorBackButton', () => {
  beforeEach(() => {
    mockPush.mockReset()
  })

  it('navigates immediately when the editor is clean', async () => {
    const user = userEvent.setup()
    render(<EditorBackButton isDirty={false} />)

    await user.click(screen.getByRole('button', { name: /Back to logbook/ }))

    expect(mockPush).toHaveBeenCalledWith('/logbook')
  })

  it('requires confirmation before discarding unsaved changes', async () => {
    const user = userEvent.setup()
    render(<EditorBackButton isDirty />)

    await user.click(screen.getByRole('button', { name: /Back to logbook/ }))

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Discard unsaved changes?')

    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(mockPush).toHaveBeenCalledWith('/logbook')
  })
})
