import { describe, expect, test } from 'vitest'
import { buildSelectableImageIdByImageId } from '@/lib/image-identity'

describe('buildSelectableImageIdByImageId', () => {
  test('maps null-coordinate images to the coord-bearing twin', () => {
    const result = buildSelectableImageIdByImageId(
      [
        { id: 'linked', latitude: 51.1, longitude: 0.2 },
        { id: 'source', latitude: null, longitude: null },
      ],
      [
        { linked_image_id: 'linked', source_image_id: 'source' },
      ]
    )

    expect(result.source).toBe('linked')
    expect(result.linked).toBe('linked')
  })
})
