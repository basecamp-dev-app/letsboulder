import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { withApiMiddleware } = vi.hoisted(() => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware,
}))

import { GET as getSubmissionInvite, POST as postSubmissionInvite } from '@/app/api/submissions/collaborate/[token]/route'
import { GET as getDraftInvite, POST as postDraftInvite } from '@/app/api/submissions/drafts/collaborate/[token]/route'

const TOKEN = 'c567597a-9a8a-420b-9371-564d0bd461fa'

function params() {
  return { params: Promise.resolve({ token: TOKEN }) }
}

function request(method: 'GET' | 'POST', path: string) {
  return new NextRequest(`https://letsboulder.com${path}`, { method })
}

describe('collaborator invitation claims', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('submission GET redirects to confirmation without claiming access', async () => {
    const response = await getSubmissionInvite(request('GET', `/api/submissions/collaborate/${TOKEN}`), params())

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://letsboulder.com/collaborate/submission/${TOKEN}`)
    expect(withApiMiddleware).not.toHaveBeenCalled()
  })

  test('submission POST claims access after protected middleware succeeds', async () => {
    const rpc = vi.fn(async () => ({ data: { image_id: 'image-1' }, error: null }))
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: true, supabase: { rpc }, userId: 'user-1' } as never)

    const response = await postSubmissionInvite(request('POST', `/api/submissions/collaborate/${TOKEN}`), params())

    expect(withApiMiddleware).toHaveBeenCalledWith(expect.any(NextRequest), {
      unauthorizedMessage: 'Authentication required',
    })
    expect(rpc).toHaveBeenCalledWith('claim_submission_collaborator_invite', { p_token: TOKEN })
    await expect(response.json()).resolves.toEqual({
      success: true,
      redirectTo: '/logbook/submissions/image-1/edit?collab=added',
    })
  })

  test('draft GET redirects to confirmation without claiming access', async () => {
    const response = await getDraftInvite(request('GET', `/api/submissions/drafts/collaborate/${TOKEN}`), params())

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://letsboulder.com/collaborate/draft/${TOKEN}`)
    expect(withApiMiddleware).not.toHaveBeenCalled()
  })

  test('draft POST claims access after protected middleware succeeds', async () => {
    const rpc = vi.fn(async () => ({ data: { draft_id: 'draft-1' }, error: null }))
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: true, supabase: { rpc }, userId: 'user-1' } as never)

    const response = await postDraftInvite(request('POST', `/api/submissions/drafts/collaborate/${TOKEN}`), params())

    expect(withApiMiddleware).toHaveBeenCalledWith(expect.any(NextRequest), {
      unauthorizedMessage: 'Authentication required',
    })
    expect(rpc).toHaveBeenCalledWith('claim_submission_draft_collaborator_invite', { p_token: TOKEN })
    await expect(response.json()).resolves.toEqual({
      success: true,
      redirectTo: '/logbook/drafts/draft-1/edit?collab=added',
    })
  })

  test('POST cannot claim when middleware rejects the request', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValue({ ok: false, response: new Response('Forbidden', { status: 403 }) })

    const response = await postSubmissionInvite(request('POST', `/api/submissions/collaborate/${TOKEN}`), params())

    expect(response.status).toBe(403)
  })
})
