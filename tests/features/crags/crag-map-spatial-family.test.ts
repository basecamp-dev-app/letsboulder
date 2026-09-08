import { describe, expect, it } from 'vitest'
import { buildCragImageClusterModel } from '@/features/crags/hooks/use-crag-page-filters'
import { buildCragMapImages, type CragMapImageRow } from '@/features/crags/lib/crag-map-images'

function createImageRow(overrides: Partial<CragMapImageRow> & Pick<CragMapImageRow, 'id'>): CragMapImageRow {
  const { id, ...rest } = overrides
  return {
    id,
    url: `private://media/images/originals/${id}.jpg`,
    latitude: 49.183,
    longitude: -2.1,
    created_at: '2026-09-08T00:00:00.000Z',
    is_verified: false,
    verification_count: 0,
    is_primary: true,
    parent_image_id: null,
    submission_id: 'shared-submission',
    processing_status: 'ready',
    moderation_status: 'approved',
    visibility: 'public',
    status: 'approved',
    route_lines: [{ count: 1 }],
    ...rest,
  }
}

describe('crag map spatial image families', () => {
  it('keeps separate pins for family images with genuinely different GPS positions', () => {
    const images = buildCragMapImages([
      createImageRow({ id: 'primary' }),
      createImageRow({
        id: 'nearby-face',
        is_primary: false,
        latitude: 49.183001,
      }),
      createImageRow({
        id: 'distant-face',
        is_primary: false,
        latitude: 49.184,
      }),
    ], [])

    expect(images.find((image) => image.id === 'nearby-face')?.map_primary_image_id).toBe('primary')
    expect(images.find((image) => image.id === 'distant-face')?.map_primary_image_id).toBe('distant-face')

    const model = buildCragImageClusterModel(images)
    expect(model.mapPins).toHaveLength(2)

    const nearPin = model.mapPins.find((pin) => pin.activeImageIds?.includes('primary'))
    const distantPin = model.mapPins.find((pin) => pin.activeImageIds?.includes('distant-face'))

    expect(new Set(nearPin?.activeImageIds)).toEqual(new Set(['primary', 'nearby-face']))
    expect(distantPin?.activeImageIds).toEqual(['distant-face'])
  })
})
