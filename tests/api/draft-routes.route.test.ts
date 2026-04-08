import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { withApiMiddleware } = vi.hoisted(() => ({
  withApiMiddleware: vi.fn(),
}))

const { getServerClient } = vi.hoisted(() => ({
  getServerClient: vi.fn(),
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware,
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClient,
}))

import { POST } from '@/app/api/submissions/drafts/[id]/routes/route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/submissions/drafts/draft-1/routes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/submissions/drafts/[id]/routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('syncs multiple draft images in one request', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: table === 'submission_drafts'
                ? { id: 'draft-1', user_id: 'user-1' }
                : null,
              error: null,
            })),
          })),
        })),
      })),
      rpc,
    }

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {} as never,
      userId: 'user-1',
    })
    vi.mocked(getServerClient).mockResolvedValue(supabase as never)

    const response = await POST(makeRequest({
      images: [
        {
          draftImageId: 'img-1',
          routes: [{ id: 'route-1', name: 'A', grade: '6A', climbType: 'boulder', points: [], sequenceOrder: 0 }],
        },
        {
          draftImageId: 'img-2',
          routes: [{ id: 'route-2', name: 'B', grade: '6B', climbType: 'boulder', points: [], sequenceOrder: 0 }],
        },
      ],
    }), { params: Promise.resolve({ id: 'draft-1' }) })

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'sync_submission_draft_routes', expect.objectContaining({ p_draft_image_id: 'img-1' }))
    expect(rpc).toHaveBeenNthCalledWith(2, 'sync_submission_draft_routes', expect.objectContaining({ p_draft_image_id: 'img-2' }))
  })
})
