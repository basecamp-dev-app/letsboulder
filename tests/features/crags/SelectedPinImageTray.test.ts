// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SelectedPinImageTray from '@/features/crags/components/SelectedPinImageTray'

describe('SelectedPinImageTray', () => {
  it('renders selected pin images with route-less CTA copy', () => {
    render(
      React.createElement(SelectedPinImageTray, {
        images: [
          {
            id: 'image-1',
            url: 'https://example.com/a.jpg',
            routeLinesCount: 0,
            href: '/gb/test-crag/i/image-1',
            isSelected: true,
            hasRoutes: false,
          },
          {
            id: 'image-2',
            url: 'https://example.com/b.jpg',
            routeLinesCount: 0,
            href: '/gb/test-crag/i/image-2',
            isSelected: false,
            hasRoutes: false,
          },
        ],
      })
    )

    expect(screen.getByText('Images at this pin')).toBeTruthy()
    expect(screen.getByText('No topo yet. Open an image to add route data.')).toBeTruthy()
    expect(screen.getAllByText('No topo yet')).toHaveLength(2)
    expect(screen.getAllByText('Open to add routes')).toHaveLength(2)

    const links = screen.getAllByRole('link')
    expect(links[0]?.getAttribute('href')).toBe('/gb/test-crag/i/image-1')
    expect(links[1]?.getAttribute('href')).toBe('/gb/test-crag/i/image-2')
  })

  it('renders routed copy when an image has mapped routes', () => {
    render(
      React.createElement(SelectedPinImageTray, {
        images: [
          {
            id: 'image-1',
            url: 'https://example.com/a.jpg',
            routeLinesCount: 2,
            href: '/gb/test-crag/i/image-1?image=image-1&route=route-1&climb=climb-1',
            isSelected: true,
            hasRoutes: true,
          },
          {
            id: 'image-2',
            url: 'https://example.com/b.jpg',
            routeLinesCount: 0,
            href: '/gb/test-crag/i/image-2',
            isSelected: false,
            hasRoutes: false,
          },
        ],
      })
    )

    expect(screen.getByText('Choose an image to inspect the topo or add missing route data.')).toBeTruthy()
    expect(screen.getByText('2 routes')).toBeTruthy()
    expect(screen.getByText('Open image')).toBeTruthy()
  })
})
