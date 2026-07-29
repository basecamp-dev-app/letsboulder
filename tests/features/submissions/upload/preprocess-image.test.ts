// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preprocessFile } from '@/features/media-upload/lib/preprocess-image'

const mocks = vi.hoisted(() => ({
  convertHeicToJpegBlob: vi.fn(),
  imageCompression: vi.fn(),
}))

vi.mock('browser-image-compression', () => ({ default: mocks.imageCompression }))
vi.mock('@/lib/heic-converter', () => ({ convertHeicToJpegBlob: mocks.convertHeicToJpegBlob }))

describe('media upload image preprocessing', () => {
  beforeEach(() => {
    mocks.convertHeicToJpegBlob.mockReset()
    mocks.imageCompression.mockReset()
    mocks.imageCompression.mockImplementation(async (file: File) => file)
  })

  it('creates a stripped, bounded JPEG upload without a web worker', async () => {
    const original = new File(['jpeg'], 'wall.webp', { type: 'image/webp', lastModified: 123 })

    const prepared = await preprocessFile(original)

    expect(mocks.imageCompression).toHaveBeenCalledWith(original, {
      maxWidthOrHeight: 3200,
      maxSizeMB: 3,
      initialQuality: 0.88,
      fileType: 'image/jpeg',
      preserveExif: false,
      useWebWorker: false,
    })
    expect(prepared.name).toBe('wall.jpg')
    expect(prepared.type).toBe('image/jpeg')
    expect(prepared.lastModified).toBe(123)
  })

  it('converts HEIC to JPEG before compression', async () => {
    const original = new File(['heic'], 'wall.heic', { type: 'image/heic', lastModified: 456 })
    const converted = new Blob(['jpeg'], { type: 'image/jpeg' })
    mocks.convertHeicToJpegBlob.mockResolvedValue(converted)

    await preprocessFile(original)

    expect(mocks.convertHeicToJpegBlob).toHaveBeenCalledWith(original)
    const compressionInput = mocks.imageCompression.mock.calls[0]?.[0]
    expect(compressionInput).toBeInstanceOf(File)
    expect(compressionInput).toMatchObject({ name: 'wall.jpg', type: 'image/jpeg', lastModified: 456 })
  })
})
