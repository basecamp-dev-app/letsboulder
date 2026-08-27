import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConnectivity } from '@/features/offline/hooks/use-connectivity'
import { CONNECTIVITY_RESPONSE_HEADER } from '@/lib/offline/connectivity'

function ConnectivityStatus() {
  const { status } = useConnectivity()
  return <output>{status}</output>
}

function onlineResponse() {
  return new Response(null, {
    status: 204,
    headers: { [CONNECTIVITY_RESPONSE_HEADER]: 'online' },
  })
}

describe('offline connectivity indicator', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }))
  afterEach(() => vi.unstubAllGlobals())

  it('shows airplane mode immediately while verification remains non-blocking', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))

    render(<ConnectivityStatus />)

    expect(await screen.findByText('offline')).toBeInTheDocument()
  })

  it('recognizes reconnection automatically', async () => {
    const fetchMock = vi.fn(async () => onlineResponse())
    vi.stubGlobal('fetch', fetchMock)
    render(<ConnectivityStatus />)
    await screen.findByText('online')

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByText('offline')).toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(screen.getByText('online')).toBeInTheDocument())
  })

  it('does not let an older probe overwrite a newer offline event', async () => {
    let resolveProbe: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveProbe = resolve })))
    render(<ConnectivityStatus />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())

    act(() => window.dispatchEvent(new Event('offline')))
    await act(async () => resolveProbe(onlineResponse()))

    expect(screen.getByText('offline')).toBeInTheDocument()
  })
})
