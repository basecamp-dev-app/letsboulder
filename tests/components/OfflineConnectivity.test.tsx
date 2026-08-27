import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import OfflineStatusView from '@/features/offline/components/OfflineStatusView'
import { CONNECTIVITY_RESPONSE_HEADER } from '@/lib/offline/connectivity'

describe('offline connectivity recovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses verified reachability even when navigator.onLine is stale', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 204,
      headers: { [CONNECTIVITY_RESPONSE_HEADER]: 'online' },
    })))

    render(<OfflineStatusView />)

    expect(await screen.findByRole('heading', { name: 'You’re back online' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to online app' })).toHaveAttribute('href', '/')
  })

  it('updates automatically across offline and online browser events', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 204,
      headers: { [CONNECTIVITY_RESPONSE_HEADER]: 'online' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<OfflineStatusView />)
    await screen.findByRole('heading', { name: 'You’re back online' })

    window.dispatchEvent(new Event('offline'))
    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()

    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'You’re back online' })).toBeInTheDocument())
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does not let an older successful probe overwrite a newer offline event', async () => {
    let resolveProbe: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveProbe = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<OfflineStatusView />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    await act(async () => resolveProbe(new Response(null, {
      status: 204,
      headers: { [CONNECTIVITY_RESPONSE_HEADER]: 'online' },
    })))

    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
  })
})
