import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ImageFirstFooterRail } from '@/features/image-first/components/image-first-sections'

const mocks = vi.hoisted(() => ({
  selectRoute: null as ((routeId: string | null) => void) | null,
}))

vi.mock('@/features/route-editor/public', () => ({
  RouteEditorRail: ({ onSelectRoute }: { onSelectRoute: (routeId: string | null) => void }) => {
    mocks.selectRoute = onSelectRoute
    return <button type="button" onClick={() => onSelectRoute('route-jenga')}>Select Jenga</button>
  },
  UnifiedRouteCanvas: () => null,
}))

describe('ImageFirstFooterRail route navigation', () => {
  beforeEach(() => {
    mocks.selectRoute = null
    window.history.replaceState(
      null,
      '',
      '/gg/fort-hommet/i/image-1?image=image-1&route=the-digger&climb=climb-1',
    )
  })

  it('updates the route query synchronously without calling the navigation fallback', () => {
    const fallback = vi.fn()
    const pushState = vi.spyOn(window.history, 'pushState')

    render(
      <ImageFirstFooterRail
        visibleRoutes={[]}
        activeRouteId="route-digger"
        onRouteSelect={fallback}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select Jenga' }))

    expect(fallback).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledWith(
      null,
      '',
      '/gg/fort-hommet/i/image-1?image=image-1&route=route-jenga',
    )
    expect(window.location.search).toBe('?image=image-1&route=route-jenga')
  })

  it('clears route and climb params without navigating when route selection is cleared', () => {
    const fallback = vi.fn()

    render(
      <ImageFirstFooterRail
        visibleRoutes={[]}
        activeRouteId="route-digger"
        onRouteSelect={fallback}
      />,
    )

    mocks.selectRoute?.(null)

    expect(fallback).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?image=image-1')
  })
})
