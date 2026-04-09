// @vitest-environment jsdom

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CragSelector from '@/features/submissions/components/CragSelector'
import type { SubmissionCrag } from '@/features/submissions/lib/submission-types'

const mockUseAtlasAutoSync = vi.fn()

vi.mock('@/features/submissions/editor/location/use-atlas-auto-sync', () => ({
  useAtlasAutoSync: (...args: Parameters<typeof mockUseAtlasAutoSync>) => mockUseAtlasAutoSync(...args),
}))

vi.mock('@/features/submissions/components/AtlasContextCard', () => ({
  default: () => null,
}))

function createCrag(overrides: Partial<SubmissionCrag> = {}): SubmissionCrag {
  return {
    id: 'crag-1',
    name: 'Harrison\'s Rocks',
    latitude: 51.1,
    longitude: 0.187,
    region_id: null,
    description: null,
    access_notes: null,
    rock_type: 'sandstone',
    type: 'boulder',
    created_at: '2026-04-09T00:00:00.000Z',
    countryCode: 'GB',
    regionName: 'Northern Europe',
    subArea: null,
    ...overrides,
  }
}

describe('CragSelector', () => {
  beforeEach(() => {
    mockUseAtlasAutoSync.mockReturnValue({
      atlas: null,
      nearbyCrag: { id: 'crag-1', name: 'Harrison\'s Rocks', distanceMeters: 10, dominantRouteType: 'boulder' },
      loading: false,
      error: null,
    })
  })

  it('auto-selects a detected nearby crag when none is selected', async () => {
    const onSelect = vi.fn()
    const nearbyCrag = createCrag()

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/crags/nearby?')) {
        return new Response(JSON.stringify([nearbyCrag]), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(React.createElement(CragSelector, {
      latitude: 51.099735799722225,
      longitude: 0.18700589999999997,
      onSelect,
      selectedCragId: null,
    }))

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'crag-1', name: 'Harrison\'s Rocks' }))
    })
  })

  it('does not override an existing selected crag', async () => {
    const onSelect = vi.fn()
    const nearbyCrag = createCrag()

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/crags/nearby?')) {
        return new Response(JSON.stringify([nearbyCrag]), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(React.createElement(CragSelector, {
      latitude: 51.099735799722225,
      longitude: 0.18700589999999997,
      onSelect,
      selectedCragId: 'existing-crag',
    }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })

    expect(onSelect).not.toHaveBeenCalled()
  })
})
