import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RegionSelector from '@/app/submit/components/RegionSelector'

vi.mock('@/features/submissions/actions/regions', () => ({
  createRegionAction: vi.fn(),
}))

const region = {
  id: 'region-1',
  name: 'Alpine Valley',
  country_code: 'FR',
  center_lat: 45,
  center_lon: 6,
  created_at: '2026-08-10T00:00:00.000Z',
}

describe('RegionSelector', () => {
  it('selects a result with keyboard controls', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([region]), { status: 200 }),
    ))

    render(<RegionSelector onSelect={onSelect} />)

    const searchInput = screen.getByLabelText('Search for a region')
    await user.type(searchInput, 'alp')

    const result = await screen.findByRole('button', { name: /Alpine Valley FR/ })
    expect(screen.getAllByRole('list').length).toBe(1)

    await user.tab()
    expect(result).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith(region)
  })
})
