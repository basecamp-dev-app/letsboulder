// @vitest-environment jsdom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CragAccessPanel } from '@/features/crags/components/CragAccessPanel'
import CragPageClient from '@/features/crags/components/CragPageClient'
import { invalidateCragQueries } from '@/features/crags/lib/invalidate-crag-queries'
import { fetchCragImages, fetchCragRoutes } from '@/features/crags/lib/crag-queries'

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: navigationMocks.replace }),
  usePathname: () => '/gb/test-crag',
  useSearchParams: () => navigationMocks.searchParams,
}))

vi.mock('@/features/crags/components/CragMapView', () => ({
  default: (props: {
    crag: { name: string }
    mapPins: Array<{ primaryImageId?: string; activeImageIds?: string[] }>
    onPinSelect: (id: string) => void
  }) => (
    <>
      <span>{props.crag.name}</span>
      <button
        type="button"
        data-testid="crag-map-view"
        data-active-image-ids={props.mapPins.flatMap((pin) => pin.activeImageIds || []).join(',')}
        onClick={() => {
          const imageId = props.mapPins[0]?.primaryImageId
          if (imageId) props.onPinSelect(imageId)
        }}
      />
    </>
  ),
}))

vi.mock('@/features/crags/lib/crag-queries', async () => {
  const actual = await vi.importActual<typeof import('@/features/crags/lib/crag-queries')>('@/features/crags/lib/crag-queries')
  return {
    ...actual,
    fetchCragImages: vi.fn(),
    fetchCragRoutes: vi.fn(),
  }
})

vi.mock('@/lib/media/thumbnail-url', () => ({
  buildThumbnailUrl: (url: string) => url,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
}))

describe('CragPageClient selected image flow', () => {
  beforeEach(() => {
    navigationMocks.replace.mockReset()
    navigationMocks.searchParams = new URLSearchParams()
    vi.mocked(fetchCragImages).mockReset()
    vi.mocked(fetchCragRoutes).mockReset()
  })

  it('refreshes renamed metadata and published route targets after invalidation', async () => {
    const queryClient = new QueryClient()
    const initialCrag = {
      id: 'crag-1', name: 'Old Crag', slug: 'old-crag', country_code: 'GB', latitude: 51, longitude: 0.1,
      region_id: null, description: null, access_notes: null, rock_type: null, type: null,
    }
    const image = {
      id: 'new-image', url: 'https://example.com/new.jpg', latitude: 51, longitude: 0.1,
      route_lines_count: 1, is_verified: false, verification_count: 0, supplementary_faces_count: 0,
    }
    const initialImage = { ...image, id: 'old-image', url: 'https://example.com/old.jpg' }

    vi.mocked(fetchCragImages).mockResolvedValue({
      crag: { ...initialCrag, name: 'Renamed Crag', slug: 'renamed-crag' },
      images: [image],
      cragCenter: [51, 0.1],
      routeImageIdsByClimbId: { 'published-climb': ['new-image'] },
      routePreviewByClimbId: { 'published-climb': { imageId: 'new-image', imageUrl: image.url } },
      defaultRouteTargetByImageId: {
        'new-image': { climbId: 'published-climb', routeId: 'edited-route-line', climbSlug: 'published-route', imageId: 'new-image' },
      },
      routeNavigationTargetByClimbId: {
        'published-climb': {
          climbId: 'published-climb', routeId: 'edited-route-line', climbSlug: 'published-route', imageId: 'new-image',
          displayImageId: 'new-image', displayImageUrl: image.url,
        },
      },
    })
    vi.mocked(fetchCragRoutes).mockResolvedValue({
      routes: [{
        id: 'published-climb', name: 'Published Route', grade: '6A', slug: 'published-route', routeType: 'boulder', directions: [],
        hasTopo: true, topoImageCount: 1, ratingAvg: null, ratingCount: 0, weightedRating: null, sendCount: 0, recentSendCount60d: 0,
      }],
      effectiveClimbIdByClimbId: { 'published-climb': 'published-climb' },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <CragPageClient id="crag-1" initialCrag={initialCrag} initialImages={[initialImage]} initialRoutes={[]} initialCragCenter={[51, 0.1]} initialPayloadLoadedAt={Date.now()} />
      </QueryClientProvider>
    )

    await invalidateCragQueries(queryClient, 'crag-1')

    await waitFor(() => {
      expect(screen.getAllByText('Renamed Crag').length).toBeGreaterThan(0)
      expect(screen.getByTestId('crag-map-view').getAttribute('data-active-image-ids')).toBe('new-image')
      expect(screen.getByRole('link', { name: /open route published route/i }).getAttribute('href'))
        .toBe('/gb/renamed-crag/i/new-image?image=new-image&route=edited-route-line&climb=published-climb')
    })
  })

  it('exposes every image represented by a selected primary pin', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <CragPageClient
          id="crag-1"
          initialCrag={{
            id: 'crag-1',
            name: 'Test Crag',
            slug: 'test-crag',
            country_code: 'GB',
            latitude: 51,
            longitude: 0.1,
            region_id: null,
            description: null,
            access_notes: null,
            rock_type: null,
            type: null,
          }}
          initialImages={[
            {
              id: 'primary-image',
              url: 'https://example.com/primary.jpg',
              latitude: 51,
              longitude: 0.1,
              route_lines_count: 0,
              is_verified: false,
              verification_count: 0,
              supplementary_faces_count: 1,
              map_primary_image_id: 'primary-image',
            },
            {
              id: 'supplementary-image',
              url: 'https://example.com/supplementary.jpg',
              latitude: 51.000001,
              longitude: 0.1,
              route_lines_count: 0,
              is_verified: false,
              verification_count: 0,
              supplementary_faces_count: 1,
              map_primary_image_id: 'primary-image',
            },
          ]}
          initialRoutes={[]}
          initialCragCenter={[51, 0.1]}
          initialRouteTargetsComplete={true}
          initialCriticalImagesComplete={true}
          initialMapImagesComplete={true}
        />
      </QueryClientProvider>
    )

    const map = screen.getByTestId('crag-map-view')
    expect(new Set(map.getAttribute('data-active-image-ids')?.split(','))).toEqual(new Set(['primary-image', 'supplementary-image']))

    fireEvent.click(map)

    expect(navigationMocks.replace).toHaveBeenCalledWith('/gb/test-crag?image=primary-image', { scroll: false })
  })

  it('hydrates the selected image from the URL while route refresh is unavailable', () => {
    const queryClient = new QueryClient()
    navigationMocks.searchParams = new URLSearchParams('image=image-selected')

    render(
      <QueryClientProvider client={queryClient}>
        <CragPageClient
          id="crag-1"
          initialCrag={{
            id: 'crag-1',
            name: 'Test Crag',
            slug: 'test-crag',
            country_code: 'GB',
            latitude: 51,
            longitude: 0.1,
            region_id: null,
            description: 'Sheltered woodland bouldering.',
            access_notes: 'Park at the lower gate.\nKeep the access road clear.',
            rock_type: 'Sandstone',
            type: 'Bouldering',
          }}
          initialImages={[
            {
              id: 'image-selected',
              url: 'https://example.com/selected.jpg',
              latitude: 51,
              longitude: 0.1,
              route_lines_count: 1,
              is_verified: false,
              verification_count: 0,
              supplementary_faces_count: 0,
            },
          ]}
          initialRoutes={[
            {
              id: 'climb-1',
              name: 'Route 1',
              grade: '6A',
              slug: 'route-1',
              routeType: 'boulder',
              directions: ['N'],
              hasTopo: true,
              topoImageCount: 1,
              ratingAvg: 4,
              ratingCount: 1,
              weightedRating: 4,
              sendCount: 1,
              recentSendCount60d: 1,
            },
          ]}
          initialRouteImageIdsByClimbId={{ 'climb-1': ['image-selected'] }}
          initialRoutePreviewByClimbId={{
            'climb-1': {
              imageId: 'image-selected',
              imageUrl: 'https://example.com/selected.jpg',
            },
          }}
          initialDefaultRouteTargetByImageId={{
            'image-selected': {
              climbId: 'climb-1',
              routeId: 'route-line-1',
              climbSlug: 'route-1',
              imageId: 'image-selected',
            },
          }}
          initialRouteNavigationTargetByClimbId={{
            'climb-1': {
              climbId: 'climb-1',
              routeId: 'route-line-1',
              climbSlug: 'route-1',
              imageId: 'image-selected',
              displayImageId: 'image-selected',
              displayImageUrl: 'https://example.com/selected.jpg',
            },
          }}
          initialCragCenter={[51, 0.1]}
          initialRouteTargetsComplete={true}
          initialCriticalImagesComplete={true}
          initialMapImagesComplete={true}
          initialPayloadLoadedAt={Date.now()}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Images at this pin')).toBeTruthy()
    expect(screen.getByText('Choose an image to inspect the topo or add missing route data.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /open route route 1/i }).getAttribute('href')).toBe('/gb/test-crag/i/image-selected?image=image-selected&route=route-line-1&climb=climb-1')
    expect(screen.getByRole('link', { name: /selected pin image/i }).getAttribute('href')).toBe('/gb/test-crag/i/image-selected?image=image-selected&route=route-line-1&climb=climb-1')
    expect(screen.getByText('Park at the lower gate. Keep the access road clear.')).toBeTruthy()
    expect(screen.getByText('Sheltered woodland bouldering.')).toBeTruthy()
    expect(screen.getByText('Rock: Sandstone')).toBeTruthy()
    expect(screen.getByText('Climbing: Bouldering')).toBeTruthy()

    const map = screen.getByTestId('crag-map-view')
    const accessHeading = screen.getByRole('heading', { name: 'Access and conditions' })
    const communityHeading = screen.getByRole('heading', { name: 'Crag community' })

    expect(map.compareDocumentPosition(accessHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(accessHeading.compareDocumentPosition(communityHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('omits the access panel when no access information is available', () => {
    render(
      <CragAccessPanel
        crag={{
          id: 'crag-1',
          name: 'Test Crag',
          slug: 'test-crag',
          country_code: 'GB',
          latitude: 51,
          longitude: 0.1,
          region_id: null,
          description: null,
          access_notes: null,
          rock_type: null,
          type: null,
        }}
      />
    )

    expect(screen.queryByRole('heading', { name: 'Access and conditions' })).toBeNull()
  })
})
