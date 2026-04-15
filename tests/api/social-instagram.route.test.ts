import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

const { resolveUserIdWithFallback } = vi.hoisted(() => ({
  resolveUserIdWithFallback: vi.fn(),
}))

const { requireAdminFromSupabase } = vi.hoisted(() => ({
  requireAdminFromSupabase: vi.fn(),
}))

const { loadInstagramPostData } = vi.hoisted(() => ({
  loadInstagramPostData: vi.fn(),
}))

const { renderInstagramPost } = vi.hoisted(() => ({
  renderInstagramPost: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback,
}))

vi.mock('@/features/admin/server', () => ({
  requireAdminFromSupabase,
}))

vi.mock('@/features/social/server/load-instagram-post-data', () => ({
  loadInstagramPostData,
}))

vi.mock('@/features/social/server/instagram-template', () => ({
  renderInstagramPost,
}))

describe('GET /api/social/instagram', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getServerClientFromRequest.mockReturnValue({})
  })

  test('returns 401 when user is unauthenticated', async () => {
    resolveUserIdWithFallback.mockResolvedValue({ userId: null, authError: null })

    const { GET } = await import('@/app/api/social/instagram/route')
    const request = new NextRequest('https://letsboulder.com/api/social/instagram?country=gb&crag=harrisons-rocks&image=image-1&route=route-1')
    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(loadInstagramPostData).not.toHaveBeenCalled()
  })

  test('returns 403 when user is not admin', async () => {
    resolveUserIdWithFallback.mockResolvedValue({ userId: 'user-1', authError: null })
    requireAdminFromSupabase.mockResolvedValue(Response.json({ error: 'Admin access required' }, { status: 403 }))

    const { GET } = await import('@/app/api/social/instagram/route')
    const request = new NextRequest('https://letsboulder.com/api/social/instagram?country=gb&crag=harrisons-rocks&image=image-1&route=route-1')
    const response = await GET(request)

    expect(response.status).toBe(403)
    expect(loadInstagramPostData).not.toHaveBeenCalled()
  })
})
