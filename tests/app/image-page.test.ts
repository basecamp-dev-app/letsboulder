import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ImageFirstPayload } from '@/features/image-first/types'

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

  test('builds metadata from the public image-first payload', async () => {
    const payload: ImageFirstPayload = {
      heroImage: {
        displayImageId: 'image-1',
        src: 'https://static.letsboulder.com/image.webp',
        width: 1600,
        height: 1200,
        latitude: null,
        longitude: null,
        priority: true,
      },
      initialRoutes: [{
        routeId: 'route-line-1',
        climbId: 'climb-1',
        effectiveClimbId: 'climb-1',
        imageId: 'image-1',
        climbSlug: 'test-route',
        climbName: 'Test Route',
        climbGrade: '6A',
        climbDescription: 'A good line.',
        climbRouteType: 'boulder',
        pathData: null,
        color: '#ef4444',
        isPrimary: true,
      }],
      navigationContext: {
        cragId: 'crag-1',
        loadedCount: 1,
        orderedImageIds: ['image-1'],
        startIndex: 0,
        imageMap: { 'image-1': { src: 'https://static.letsboulder.com/image.webp', width: 1600, height: 1200 } },
        linkedImageIdByDisplayId: { 'image-1': 'image-1' },
        stacks: [],
        sectorMarkers: {},
      },
      initialClimbId: 'climb-1',
      initialRouteId: 'route-line-1',
      initialRouteSlug: 'test-route',
      cragId: 'crag-1',
      cragSlug: 'test-crag',
      cragName: 'Test Crag',
      countryCode: 'gb',
      mapPins: [],
      attribution: {
        ownerRoleLabel: 'Photo',
        ownerDisplayLabel: 'Contributor',
        ownerProfileId: null,
        formattedContributionHandle: null,
        contributionCreditUrl: null,
        communityEditorsRoleLabel: 'Community editors',
        communityEditorsCount: 0,
      },
    }

    buildImageFirstPayloadMock.mockResolvedValue({
      redirectTo: null,
      payload,
    })
    const { buildJsonLd, generateMetadata } = await import('@/app/[country]/[crag]/i/[imageId]/page')

    const metadata = await generateMetadata({
      params: Promise.resolve({ country: 'gb', crag: 'test-crag', imageId: 'image-1' }),
      searchParams: Promise.resolve({ route: 'route-line-1', climb: 'climb-1' }),
    })

    expect(metadata.title).toBe('Test Route (6A) | Test Crag topo')
    expect(metadata.description).toBe('A good line.')
    expect(metadata.alternates?.canonical).toBe('/gb/test-crag/i/image-1?route=test-route&climb=climb-1')
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://static.letsboulder.com/image.webp',
        width: 1200,
        height: 630,
        alt: 'Test Route (6A) | Test Crag topo',
      },
    ])

    const jsonLd = buildJsonLd(payload)
    expect(jsonLd[0].url).toBe('https://letsboulder.com/gb/test-crag/i/image-1?route=test-route&climb=climb-1')
    expect(jsonLd[1].itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://letsboulder.com' },
      { '@type': 'ListItem', position: 2, name: 'Test Crag', item: 'https://letsboulder.com/gb/test-crag' },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Test Route',
        item: 'https://letsboulder.com/gb/test-crag/i/image-1?route=test-route&climb=climb-1',
      },
    ])
  })
})
