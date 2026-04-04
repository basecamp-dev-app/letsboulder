import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImageUploader from '@/app/submit/components/ImageUploader'

const mockExtractGpsFromFile = vi.fn()
const mockBuildSubmittedImageSelection = vi.fn()
const mockCompressSubmissionImage = vi.fn()
const mockDetectSubmissionImageGps = vi.fn()
const mockGetImageDimensions = vi.fn()
const mockUploadSubmissionImageSession = vi.fn()

vi.mock('@/lib/image-utils', () => ({
  isHeicFile: (file: File) => file.name.toLowerCase().endsWith('.heic'),
  isSupportedImageFile: (file: File) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
}))

vi.mock('@/lib/image-gps', () => ({
  extractGpsFromFile: (...args: Parameters<typeof mockExtractGpsFromFile>) => mockExtractGpsFromFile(...args),
}))

vi.mock('@/app/submit/components/image-uploader-flow', () => ({
  buildSubmittedImageSelection: (...args: Parameters<typeof mockBuildSubmittedImageSelection>) => mockBuildSubmittedImageSelection(...args),
  compressSubmissionImage: (...args: Parameters<typeof mockCompressSubmissionImage>) => mockCompressSubmissionImage(...args),
  detectSubmissionImageGps: (...args: Parameters<typeof mockDetectSubmissionImageGps>) => mockDetectSubmissionImageGps(...args),
  getImageDimensions: (...args: Parameters<typeof mockGetImageDimensions>) => mockGetImageDimensions(...args),
  uploadSubmissionImageSession: (...args: Parameters<typeof mockUploadSubmissionImageSession>) => mockUploadSubmissionImageSession(...args),
}))

function createImageFile(name = 'route.jpg', type = 'image/jpeg', size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('ImageUploader', () => {
  beforeEach(() => {
    mockExtractGpsFromFile.mockResolvedValue(null)
    mockCompressSubmissionImage.mockResolvedValue(createImageFile('compressed.jpg'))
    mockDetectSubmissionImageGps.mockResolvedValue({ gpsData: null, previewBlob: null })
    mockGetImageDimensions.mockResolvedValue({ width: 1200, height: 900 })
    mockUploadSubmissionImageSession.mockResolvedValue({
      imageId: 'image-1',
      bucket: 'media',
      objectKey: 'uploads/image-1.jpg',
    })
    mockBuildSubmittedImageSelection.mockReturnValue({ mode: 'new', images: [], primaryIndex: 0 })
  })

  it('rejects unsupported files', async () => {
    const onError = vi.fn()

    render(<ImageUploader onComplete={vi.fn()} onError={onError} onUploading={vi.fn()} />)

    fireEvent.drop(screen.getByText('Choose original image file'), {
      dataTransfer: {
        files: [new File(['bad'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(onError).toHaveBeenCalledWith('Please select an image file (JPEG, PNG, WebP, HEIC, etc.)')
  })

  it('processes a selected file and completes upload', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()
    const onUploading = vi.fn()
    const user = userEvent.setup()
    const gpsData = { latitude: 40.1, longitude: -105.2 }

    mockDetectSubmissionImageGps.mockResolvedValue({
      gpsData,
      previewBlob: null,
    })
    mockBuildSubmittedImageSelection.mockReturnValue({
      mode: 'new',
      primaryIndex: 0,
      images: [{ uploadedImageId: 'image-1' }],
    })

    render(<ImageUploader onComplete={onComplete} onError={onError} onUploading={onUploading} />)

    const input = document.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    await user.upload(input as HTMLInputElement, createImageFile())

    expect(await screen.findByAltText('Preview')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upload Photo' }))

    await waitFor(() => {
      expect(mockUploadSubmissionImageSession).toHaveBeenCalled()
      expect(onComplete).toHaveBeenCalledWith({
        mode: 'new',
        primaryIndex: 0,
        images: [{ uploadedImageId: 'image-1' }],
      })
    })

    expect(onError).toHaveBeenCalledWith('')
    expect(onUploading).toHaveBeenCalledWith(true, 10, 'Reading GPS metadata...')
    expect(onUploading).toHaveBeenCalledWith(true, 20, 'Compressing image...')
    expect(onUploading).toHaveBeenCalledWith(true, 70, 'Getting image info...')
    expect(onUploading).toHaveBeenCalledWith(false, 100, '')
  })

  it('shows missing GPS guidance after processing without metadata', async () => {
    const user = userEvent.setup()

    render(<ImageUploader onComplete={vi.fn()} onError={vi.fn()} onUploading={vi.fn()} />)

    fireEvent.drop(screen.getByText('Choose original image file'), {
      dataTransfer: {
        files: [createImageFile()],
      },
    })

    expect(await screen.findByText(/No GPS metadata found in this file/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload Photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upload Photo' }))
    await waitFor(() => {
      expect(mockExtractGpsFromFile).toHaveBeenCalled()
    })
  })
})
