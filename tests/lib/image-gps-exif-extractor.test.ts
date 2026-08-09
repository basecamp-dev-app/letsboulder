import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { extractGpsFromFile } from '@/lib/image-gps-exif-extractor'

const fixtureUrl = new URL('../fixtures/images/IMG_20260809_133849.jpg', import.meta.url)

describe('image GPS extraction', () => {
  it('extracts GPS from the Android JPEG fixture', async () => {
    const bytes = await readFile(fixtureUrl)
    const file = new File([bytes], 'IMG_20260809_133849.jpg', { type: 'image/jpeg' })

    await expect(extractGpsFromFile(file)).resolves.toEqual({
      latitude: 50.8695344,
      longitude: -0.0123596,
    })
  })
})
