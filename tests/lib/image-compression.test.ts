import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isHeicFile, blobToDataURL, convertHeicToJpegBlob } = vi.hoisted(() => ({
  isHeicFile: vi.fn((file: File) => /\.heic$/i.test(file.name)),
  blobToDataURL: vi.fn(async () => 'data:image/jpeg;base64,converted'),
  convertHeicToJpegBlob: vi.fn(async () => new Blob(['converted'], { type: 'image/jpeg' })),
}))

vi.mock('@/lib/image-utils', () => ({ isHeicFile, blobToDataURL }))
vi.mock('@/lib/heic-converter', () => ({ convertHeicToJpegBlob }))

import { compressImage } from '@/lib/image-compression'

type CanvasOptions = { context: CanvasRenderingContext2D | null; blobSize: number }

function installBrowserMocks({ context, blobSize }: CanvasOptions) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob([new Uint8Array(blobSize)]))),
  }

  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  vi.stubGlobal('FileReader', class {
    result: string | null = 'data:image/jpeg;base64,source'
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null
    onerror: (() => void) | null = null

    readAsDataURL() {
      this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>)
    }
  })
  vi.stubGlobal('Image', class {
    width = 100
    height = 100
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    set src(_value: string) {
      this.onload?.()
    }
  })
}

describe('compressImage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('rejects before encoding when the canvas context is unavailable', async () => {
    installBrowserMocks({ context: null, blobSize: 1 })

    await expect(compressImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }), {
      maxWidthOrHeight: 100,
    })).rejects.toThrow('2D canvas context')
  })

  it('rejects when the minimum quality still exceeds the target size', async () => {
    installBrowserMocks({ context: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D, blobSize: 2049 })

    await expect(compressImage(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }), {
      maxWidthOrHeight: 100,
      maxSizeKB: 2,
      initialQuality: 0.4,
      minQuality: 0.4,
    })).rejects.toThrow('below 2 KB')
  })

  it.each([
    ['image/webp', 'photo.webp'],
    ['image/jpeg', 'photo.jpg'],
  ])('uses the requested %s extension for converted HEIC files', async (fileType, expectedName) => {
    installBrowserMocks({ context: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D, blobSize: 1 })

    const result = await compressImage(new File(['source'], 'photo.heic', { type: 'image/heic' }), {
      maxWidthOrHeight: 100,
      fileType,
      convertHeic: true,
    })

    expect(result.name).toBe(expectedName)
  })
})
