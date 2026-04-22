import { beforeEach, describe, expect, test, vi } from 'vitest'

const permanentRedirectMock = vi.fn()
const buildImageFirstPayloadMock = vi.fn()

vi.mock('next/navigation', () => ({
  permanentRedirect: permanentRedirectMock,
}))

vi.mock('@/features/image-first/server/load-image-first-page', () => ({
  buildImageFirstPayload: buildImageFirstPayloadMock,
}))

describe('app/[country]/[crag]/i/[imageId]/page', () => {
  beforeEach(() => {
    permanentRedirectMock.mockReset()
    buildImageFirstPayloadMock.mockReset()
    buildImageFirstPayloadMock.mockResolvedValue({
      redirectTo: null,
      payload: null,
    })
  })

  test('passes route query as route id only', async () => {
    const { default: ImagePage } = await import('@/app/[country]/[crag]/i/[imageId]/page')

    await ImagePage({
      params: Promise.resolve({ country: 'gb', crag: 'test-crag', imageId: 'image-1' }),
      searchParams: Promise.resolve({ image: 'image-2', route: 'route-line-1', climb: 'climb-1' }),
    })

    expect(buildImageFirstPayloadMock).toHaveBeenCalledWith({
      country: 'gb',
      crag: 'test-crag',
      imageId: 'image-1',
      selectedImageId: 'image-2',
      routeId: 'route-line-1',
      routeSlug: null,
      climbId: 'climb-1',
    })
  })
})
