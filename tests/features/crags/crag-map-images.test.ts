import { describe, expect, it, vi } from 'vitest'
import { buildCragMapImages, loadPublicCragMapImages, type CragMapImageRow } from '@/features/crags/lib/crag-map-images'
import { buildCragImageClusterModel } from '@/features/crags/hooks/use-crag-page-filters'

function createImageRow(overrides: Partial<CragMapImageRow> & Pick<CragMapImageRow, 'id'>): CragMapImageRow {
  const { id, ...rest } = overrides
  return {
    id,
    url: `private://media/images/originals/${id}.jpg`,
    latitude: 51,
    longitude: 0.1,
    created_at: '2026-01-01T00:00:00.000Z',
    is_verified: false,
    verification_count: 0,
    is_primary: true,
    parent_image_id: null,
    submission_id: null,
    processing_status: 'ready',
    moderation_status: 'approved',
    visibility: 'public',
    status: 'approved',
    route_lines: [{ count: 0 }],
    ...rest,
  }
}

describe('crag map images', () => {
  it('represents every deliverable GPS image while exposing supplementary faces through primary pins', () => {
    const rows = [
      createImageRow({ id: 'routed-primary', submission_id: 'submission-1', route_lines: [{ count: 2 }] }),
      createImageRow({
        id: 'submission-face',
        submission_id: 'submission-1',
        is_primary: false,
        latitude: 51.000001,
      }),
      createImageRow({ id: 'legacy-primary', latitude: 51.001, longitude: 0.101 }),
      createImageRow({
        id: 'legacy-face',
        is_primary: false,
        parent_image_id: 'legacy-primary',
        latitude: 51.001001,
        longitude: 0.101,
      }),
      createImageRow({ id: 'image-only-nearby', longitude: 0.100003 }),
      createImageRow({ id: 'missing-gps', latitude: null }),
      createImageRow({ id: 'pending-processing', processing_status: 'pending' }),
      createImageRow({ id: 'rejected', moderation_status: 'rejected' }),
      createImageRow({ id: 'private', visibility: 'private' }),
      createImageRow({ id: 'unapproved', status: 'pending' }),
    ]
    const images = buildCragMapImages(rows, [
      { source_image_id: 'legacy-primary', linked_image_id: 'legacy-face' },
      { source_image_id: 'routed-primary', linked_image_id: 'routed-primary' },
    ])
    const model = buildCragImageClusterModel(images)

    expect(new Set(images.map((image) => image.id))).toEqual(new Set([
      'routed-primary',
      'submission-face',
      'legacy-primary',
      'legacy-face',
      'image-only-nearby',
    ]))
    expect(images.find((image) => image.id === 'submission-face')?.map_primary_image_id).toBe('routed-primary')
    expect(images.find((image) => image.id === 'legacy-face')?.map_primary_image_id).toBe('legacy-primary')
    expect(images.find((image) => image.id === 'image-only-nearby')?.route_lines_count).toBe(0)

    const representedImageIds = new Set(model.mapPins.flatMap((pin) => pin.activeImageIds || []))
    expect(representedImageIds).toEqual(new Set(images.map((image) => image.id)))
    expect(model.mapPins).toHaveLength(2)
    expect(model.mapPins.every((pin) => !('url' in pin))).toBe(true)
    expect(model.mapPins.some((pin) => pin.activeImageIds?.includes('image-only-nearby'))).toBe(true)
    expect(model.mapPins.some((pin) => (
      pin.activeImageIds?.includes('legacy-primary') && pin.activeImageIds.includes('legacy-face')
    ))).toBe(true)
  })

  it('pages beyond the first map-image result set', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => createImageRow({
      id: `image-${String(index).padStart(3, '0')}`,
      latitude: 50 + index / 10_000,
    }))
    const secondPage = [createImageRow({ id: 'image-500', latitude: 51.5 })]
    const imageRange = vi.fn(async (from: number) => ({
      data: from === 0 ? firstPage : secondPage,
      error: null,
    }))
    const linkRange = vi.fn(async () => ({ data: [], error: null }))
    const createBuilder = (range: typeof imageRange | typeof linkRange) => {
      const chain = {
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        range,
      }
      return chain
    }
    const imageBuilder = createBuilder(imageRange)
    const linkBuilder = createBuilder(linkRange)
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => table === 'images' ? imageBuilder : linkBuilder),
      })),
    }

    const images = await loadPublicCragMapImages(supabase as never, 'crag-1')

    expect(images).toHaveLength(501)
    expect(imageRange).toHaveBeenNthCalledWith(1, 0, 499)
    expect(imageRange).toHaveBeenNthCalledWith(2, 500, 999)
    expect(imageBuilder.eq).toHaveBeenCalledWith('status', 'approved')
    expect(imageBuilder.eq).toHaveBeenCalledWith('processing_status', 'ready')
    expect(imageBuilder.eq).toHaveBeenCalledWith('visibility', 'public')
    expect(imageBuilder.in).toHaveBeenCalledWith('moderation_status', ['approved', 'skipped'])
  })
})
