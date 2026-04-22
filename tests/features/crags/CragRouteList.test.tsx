// @vitest-environment jsdom

import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CragRouteList from '@/features/crags/components/CragRouteList'

const observerInstances: Array<{
  callback: IntersectionObserverCallback
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}> = []

vi.mock('@/lib/media/thumbnail-url', () => ({
  buildThumbnailUrl: (url: string) => url,
}))

function createRoutes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `route-${index + 1}`,
    name: `Route ${index + 1}`,
    grade: '6A',
    slug: `route-${index + 1}`,
    routeType: 'sport',
    directions: [],
    hasTopo: true,
    topoImageCount: 1,
    ratingAvg: 4,
    ratingCount: 3,
    weightedRating: 4,
    sendCount: 10,
    recentSendCount60d: 1,
  }))
}

function createPreviews(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `route-${index + 1}`,
      {
        imageId: `image-${index + 1}`,
        imageUrl: `https://example.com/preview-${index + 1}.jpg`,
      },
    ])
  )
}

describe('CragRouteList thumbnail priority', () => {
  beforeEach(() => {
    observerInstances.length = 0

    class MockIntersectionObserver {
      callback: IntersectionObserverCallback
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      root = null
      rootMargin = '300px 0px 500px 0px'
      thresholds = [0.01]

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        observerInstances.push(this)
      }

      takeRecords() {
        return []
      }
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  it('prioritizes the first six route previews on initial render', () => {
    render(
      <CragRouteList
        filteredRoutes={createRoutes(8)}
        routesLoadState="loaded"
        highlightedRouteIds={new Set()}
        routePreviewDisplayByClimbId={createPreviews(8)}
        routeTargetsHydrating={false}
        routeTargetsComplete={true}
        pinNumberByImageId={new Map()}
        gradeSystem={'french_equivalent'}
        routesCount={8}
        hasActiveRouteFilters={false}
        onClearRouteFilters={vi.fn()}
        onRetryRoutes={vi.fn()}
        getRouteDestination={(route) => ({ href: `/routes/${route.id}`, ready: true })}
      />
    )

    const previews = screen.getAllByAltText(/topo preview/i)
    expect(previews).toHaveLength(8)

    previews.forEach((preview, index) => {
      if (index < 6) {
        expect(preview.getAttribute('loading')).toBe('eager')
        expect(preview.getAttribute('fetchpriority')).toBe('high')
        return
      }

      expect(preview.getAttribute('loading')).toBe('lazy')
      expect(preview.getAttribute('fetchpriority')).toBe('auto')
    })
  })

  it('promotes a later preview when it nears the viewport', () => {
    render(
      <CragRouteList
        filteredRoutes={createRoutes(8)}
        routesLoadState="loaded"
        highlightedRouteIds={new Set()}
        routePreviewDisplayByClimbId={createPreviews(8)}
        routeTargetsHydrating={false}
        routeTargetsComplete={true}
        pinNumberByImageId={new Map()}
        gradeSystem={'french_equivalent'}
        routesCount={8}
        hasActiveRouteFilters={false}
        onClearRouteFilters={vi.fn()}
        onRetryRoutes={vi.fn()}
        getRouteDestination={(route) => ({ href: `/routes/${route.id}`, ready: true })}
      />
    )

    const previews = screen.getAllByAltText(/topo preview/i)
    expect(previews[6]?.getAttribute('loading')).toBe('lazy')
    expect(observerInstances[6]).toBeTruthy()

    act(() => {
      observerInstances[6]?.callback([
        {
          isIntersecting: true,
          intersectionRatio: 1,
          target: previews[6] as Element,
        } as IntersectionObserverEntry,
      ], {} as IntersectionObserver)
    })

    expect(previews[6]?.getAttribute('loading')).toBe('eager')
    expect(previews[6]?.getAttribute('fetchpriority')).toBe('high')
  })
})
