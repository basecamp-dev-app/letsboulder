import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/connectivity/route'
import { CONNECTIVITY_RESPONSE_HEADER } from '@/lib/offline/connectivity'

describe('GET /api/connectivity', () => {
  it('returns an uncached app-specific reachability response', () => {
    const response = GET()
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get(CONNECTIVITY_RESPONSE_HEADER)).toBe('online')
  })
})
