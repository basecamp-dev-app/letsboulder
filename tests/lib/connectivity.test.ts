import { describe, expect, it, vi } from 'vitest'

import { CONNECTIVITY_RESPONSE_HEADER, probeConnectivity } from '@/lib/offline/connectivity'

describe('verified connectivity probe', () => {
  it('requires the app-specific response instead of trusting a generic successful response', async () => {
    const reachable = vi.fn(async () => new Response(null, { status: 204, headers: { [CONNECTIVITY_RESPONSE_HEADER]: 'online' } })) as unknown as typeof fetch
    const captivePortal = vi.fn(async () => new Response('<html>Sign in</html>')) as unknown as typeof fetch

    await expect(probeConnectivity(reachable)).resolves.toBe(true)
    await expect(probeConnectivity(captivePortal)).resolves.toBe(false)
    expect(reachable).toHaveBeenCalledWith('/api/connectivity', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
  })

  it('reports offline when the request fails', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(probeConnectivity(fetcher)).resolves.toBe(false)
  })
})
