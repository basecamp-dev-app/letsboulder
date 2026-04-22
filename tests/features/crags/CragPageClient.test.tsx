// @vitest-environment jsdom

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CragPageClient from '@/features/crags/components/CragPageClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/gb/test-crag',
}))

vi.mock('@/features/crags/components/CragMapView', () => ({
  default: () => <div data-testid="crag-map-view" />,
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
            description: null,
            access_notes: null,
            rock_type: null,
            type: null,
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
          initialPayloadLoadedAt={Date.now()}
          initialSelectedImageId="image-selected"
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Images at this pin')).toBeTruthy()
    expect(screen.getByText('Choose an image to inspect the topo or add missing route data.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /open route route 1/i }).getAttribute('href')).toBe('/gb/test-crag/i/image-selected?image=image-selected&route=route-line-1&climb=climb-1')
    expect(screen.getByRole('link', { name: /selected pin image/i }).getAttribute('href')).toBe('/gb/test-crag/i/image-selected?image=image-selected&route=route-line-1&climb=climb-1')
  })
})
