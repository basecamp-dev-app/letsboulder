import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/features/crags/server', () => ({
  loadCragImages: vi.fn(async () => Response.json({ images: ['preserved'] })),
}))

import { GET, POST } from '@/app/api/crags/[id]/images/route'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { loadCragImages } from '@/features/crags/server'

describe('Crag images route', () => {
  test('POST is retired before multipart data can write', async () => {
    const response = await POST()

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({
      error: 'Legacy multipart crag image upload has been retired',
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
