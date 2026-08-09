import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { detectSubmissionImageGps } from '@/features/submissions/lib/image-uploader-flow'

const fixtureUrl = new URL('../../fixtures/images/IMG_20260809_133849.jpg', import.meta.url)

describe('submission image GPS detection', () => {
  it('reports GPS from the original Android JPEG file', async () => {
    const bytes = await readFile(fixtureUrl)
    const file = new File([bytes], 'IMG_20260809_133849.jpg', { type: 'image/jpeg' })

    await expect(detectSubmissionImageGps(file)).resolves.toMatchObject({
      gpsData: {
        latitude: 50.8695344,
        longitude: -0.0123596,
      },
      gpsSource: 'original-file',
      previewBlob: null,
    })
  })
})
