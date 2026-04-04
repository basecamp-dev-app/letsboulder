import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ImagePicker from '@/features/submissions/components/ImagePicker'

function createFile(name: string, type: string) {
  return new File(['file'], name, { type })
}

describe('ImagePicker', () => {
  it('passes selected image files to the callback', async () => {
    const onFilesSelected = vi.fn()
    const user = userEvent.setup()

    render(<ImagePicker onFilesSelected={onFilesSelected} />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, [
      createFile('one.jpg', 'image/jpeg'),
      createFile('two.heic', 'application/octet-stream'),
      createFile('notes.txt', 'text/plain'),
    ])

    expect(onFilesSelected).toHaveBeenCalledTimes(1)
    expect(onFilesSelected).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'one.jpg' }),
      expect.objectContaining({ name: 'two.heic' }),
    ])
  })

  it('shows an error when no valid image files are selected', async () => {
    const onFilesSelected = vi.fn()

    render(<ImagePicker onFilesSelected={onFilesSelected} />)

    fireEvent.drop(screen.getByText('Drop photos or click to select'), {
      dataTransfer: {
        files: [createFile('notes.txt', 'text/plain')],
      },
    })

    expect(onFilesSelected).not.toHaveBeenCalled()
    expect(screen.getByText('Select at least one image file.')).toBeInTheDocument()
  })
})
