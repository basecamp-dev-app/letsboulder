import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(),
}))

vi.mock('@/features/crags/server', () => ({
  loadCragImages: vi.fn(async () => Response.json({ images: ['preserved'] })),
}))

import { GET, POST } from '@/app/api/crags/[id]/images/route'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { withCsrfProtection } from '@/lib/csrf-server'
import { loadCragImages } from '@/features/crags/server'

describe('Crag images route', () => {
  test('POST rejects requests that fail CSRF validation', async () => {
    vi.mocked(withCsrfProtection).mockResolvedValue({
      valid: false,
      response: NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    })

    const request = new NextRequest('http://localhost/api/crags/crag-1/images', { method: 'POST' })
    const response = await POST(request, { params: Promise.resolve({ id: 'crag-1' }) })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid CSRF token',
    })
  })

  test('GET still loads crag images', async () => {
    const request = new NextRequest('http://localhost/api/crags/crag-1/images')
    const client = { from: vi.fn() }
    vi.mocked(getServerClientFromRequest).mockReturnValue(client as never)

    const response = await GET(request, { params: Promise.resolve({ id: 'crag-1' }) })

    expect(response.status).toBe(200)
    expect(loadCragImages).toHaveBeenCalledWith(client, 'crag-1')
  })
})
