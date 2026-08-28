import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Header from '@/components/Header'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/components/use-lazy-auth-user', () => ({
  useLazyAuthUser: () => ({ user: null, load: vi.fn() }),
}))
vi.mock('@/components/QueryProviders', () => ({
  useSignOut: () => vi.fn(async () => true),
}))

interface SearchResponse {
  data: unknown[] | null
  error: Error | null
}

function createSearchClient(cragsResponse: SearchResponse | Promise<SearchResponse>, climbsResponse: SearchResponse | Promise<SearchResponse>) {
  return {
    from: vi.fn((table: string) => {
      const response = table === 'crags' ? cragsResponse : climbsResponse
      const builder = {
        select: vi.fn(),
        ilike: vi.fn(),
        limit: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        in: vi.fn(),
        abortSignal: vi.fn(() => Promise.resolve(response)),
      }
      builder.select.mockReturnValue(builder)
      builder.ilike.mockReturnValue(builder)
      builder.limit.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.is.mockReturnValue(builder)
      builder.in.mockReturnValue(builder)
      return builder
    }),
  }
}

async function searchFor(query: string) {
  fireEvent.change(screen.getByRole('combobox', { name: /search all crags and climbs/i }), {
    target: { value: query },
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('Header search', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('disambiguates duplicate names with human-readable place context and preserves keyboard selection', async () => {
    vi.useFakeTimers()
    mocks.createClient.mockReturnValue(createSearchClient({
      data: [
        { id: 'crag-ch', name: 'Magic Wood', latitude: 46.3, longitude: 9.6, slug: 'magic-wood', country_code: 'ch', region_name: 'Graubünden', sub_area: 'Valsot' },
        { id: 'crag-gb', name: 'Magic Wood', latitude: 53.3, longitude: -1.6, slug: 'magic-wood-north', country_code: 'gb', region_name: 'Peak District', sub_area: null },
      ],
      error: null,
    }, {
      data: [
        { id: 'climb-1', name: 'Magic Line', crags: { name: 'Magic Wood', latitude: 46.3, longitude: 9.6, country_code: 'ch', region_name: 'Graubünden', sub_area: 'Valsot' } },
      ],
      error: null,
    }))

    render(<Header />)
    await searchFor('magic')

    const listbox = screen.getByRole('listbox', { name: /search results/i })
    expect(within(listbox).getByText('Valsot, Graubünden, Switzerland')).toBeVisible()
    expect(within(listbox).getByText('Peak District, United Kingdom')).toBeVisible()
    expect(within(listbox).getByText('at Magic Wood — Valsot, Graubünden, Switzerland')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('3 results: 2 crags and 1 climb.')

    const searchbox = screen.getByRole('combobox', { name: /search all crags and climbs/i })
    expect(within(listbox).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(searchbox, { key: 'ArrowDown' })
    expect(within(listbox).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(searchbox, { key: 'Enter' })
    expect(mocks.push).toHaveBeenCalledWith('/gb/magic-wood-north')
  })

  it('offers clear and map recovery actions for an empty query', async () => {
    vi.useFakeTimers()
    mocks.createClient.mockReturnValue(createSearchClient(
      { data: [], error: null },
      { data: [], error: null },
    ))

    render(<Header />)
    await searchFor('Burbage')

    expect(screen.getByText('No crags or climbs matched "Burbage".')).toBeVisible()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('No crags or climbs matched Burbage.')
    expect(screen.getByRole('link', { name: 'Browse map' })).toHaveAttribute('href', '/')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('combobox', { name: /search all crags and climbs/i })).toHaveValue('')
    expect(screen.queryByText(/No crags or climbs matched/)).not.toBeInTheDocument()
  })

  it('shows a retry action when either search query fails', async () => {
    vi.useFakeTimers()
    mocks.createClient.mockReturnValue(createSearchClient(
      { data: null, error: new Error('offline') },
      { data: [], error: null },
    ))

    render(<Header />)
    await searchFor('magic')

    expect(screen.getAllByText('Search is unavailable right now. Try again.')[0]).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('keeps the loading state visible for a slow response and announces it once', async () => {
    vi.useFakeTimers()
    let resolveSearch: (response: SearchResponse) => void = () => undefined
    const pendingSearch = new Promise<SearchResponse>((resolve) => {
      resolveSearch = resolve
    })
    mocks.createClient.mockReturnValue(createSearchClient(pendingSearch, pendingSearch))

    render(<Header />)
    fireEvent.change(screen.getByRole('combobox', { name: /search all crags and climbs/i }), {
      target: { value: 'magic' },
    })
    expect(screen.getByText('Searching crags and climbs...')).toBeVisible()
    expect(screen.queryByText(/No crags or climbs matched/)).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(screen.getByText('Searching crags and climbs...')).toBeVisible()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Searching crags and climbs.')

    await act(async () => {
      resolveSearch({ data: [], error: null })
      await Promise.resolve()
    })
    expect(screen.getByText('No crags or climbs matched "magic".')).toBeVisible()
  })

  it('opens a climb result with a pointer click', async () => {
    vi.useFakeTimers()
    mocks.createClient.mockReturnValue(createSearchClient({ data: [], error: null }, {
      data: [{ id: 'climb-1', name: 'Magic Line', crags: { name: 'Magic Wood', latitude: 46.3, longitude: 9.6, country_code: 'ch', region_name: 'Graubünden', sub_area: null } }],
      error: null,
    }))

    render(<Header />)
    await searchFor('Magic Line')
    fireEvent.click(screen.getByRole('option', { name: /Magic Line/i }))

    expect(mocks.push).toHaveBeenCalledWith('/climb/climb-1')
  })

  it('closes results on Escape without trapping Tab', async () => {
    vi.useFakeTimers()
    mocks.createClient.mockReturnValue(createSearchClient({
      data: [{ id: 'crag-1', name: 'Bo', latitude: 1, longitude: 1, slug: 'bo', country_code: 'gb', region_name: null, sub_area: null }],
      error: null,
    }, { data: [], error: null }))

    render(<Header />)
    await searchFor('bo')

    const searchbox = screen.getByRole('combobox', { name: /search all crags and climbs/i })
    fireEvent.keyDown(searchbox, { key: 'Escape' })
    expect(searchbox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.keyDown(searchbox, { key: 'Tab' })
    expect(searchbox).not.toHaveAttribute('aria-activedescendant')
  })

  it('announces the minimum query length through one status region', () => {
    mocks.createClient.mockReturnValue(createSearchClient(
      { data: [], error: null },
      { data: [], error: null },
    ))

    render(<Header />)
    fireEvent.change(screen.getByRole('combobox', { name: /search all crags and climbs/i }), {
      target: { value: 'm' },
    })

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Type at least 2 characters to search all crags and climbs.')
  })
})
