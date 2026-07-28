// @vitest-environment jsdom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CragAccessPanel } from '@/features/crags/components/CragAccessPanel'
import CragPageClient from '@/features/crags/components/CragPageClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/gb/test-crag',
}))

vi.mock('@/features/crags/components/CragMapView', () => ({
  default: (props: {
    mapPins: Array<{ primaryImageId?: string; activeImageIds?: string[] }>
    onPinSelect: (id: string) => void
  }) => (
    <button
      type="button"
      data-testid="crag-map-view"
      data-active-image-ids={props.mapPins.flatMap((pin) => pin.activeImageIds || []).join(',')}
      onClick={() => {
        const imageId = props.mapPins[0]?.primaryImageId
        if (imageId) props.onPinSelect(imageId)
      }}
    />
  ),
}))

vi.mock('@/lib/media/thumbnail-url', () => ({
  buildThumbnailUrl: (url: string) => url,
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  }),
}))

describe('CragPageClient selected image flow', () => {
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

    expect(screen.getByText('2 images')).toBeTruthy()
    expect(screen.getByText('No topo yet. Open an image to add route data.')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    for (const thumbnail of screen.getAllByRole('img')) {
      expect(thumbnail.getAttribute('loading')).toBe('lazy')
    }
  })

  it('honors the selected image on first render while route refresh is unavailable', () => {
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
          initialSelectedImageId="image-selected"
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
