import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClientWithAudit: vi.fn(),
  reportError: vi.fn(),
  resendSend: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/csrf-server', () => ({ withApiMiddleware: mocks.withApiMiddleware }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  createRateLimitResponse: vi.fn(() => new Response(null, { status: 429 })),
}))
vi.mock('@/lib/supabase-admin', () => ({ getAdminClientWithAudit: mocks.getAdminClientWithAudit }))
vi.mock('@/lib/errors', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/errors')>(),
  reportError: mocks.reportError,
}))
vi.mock('@/lib/env.server', () => ({
  serverEnv: { NEXT_PUBLIC_APP_URL: 'https://letsboulder.test', RESEND_API_KEY: 'resend-key' },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend }
  },
}))

import { POST } from '@/app/api/welcome-email/route'

const user = { id: 'user-1', email: 'user@example.test' }

function request(email = user.email) {
  return new NextRequest('http://localhost/api/welcome-email', {
    method: 'POST',
    body: JSON.stringify({ email, firstName: 'Alex' }),
  })
}

describe('POST /api/welcome-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: [{ id: user.id, welcome_email_sent_at: null }], error: null })
    mocks.resendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const is = vi.fn().mockResolvedValue({ error: null })
    const eq = vi.fn(() => ({ is }))
    mocks.update.mockReturnValue({ eq })
    const admin = {
      from: vi.fn((table: string) => {
        expect(table).toBe('profiles')
        return { select: () => { throw new Error('service-role read forbidden') }, update: mocks.update }
      }),
    }
    mocks.getAdminClientWithAudit.mockReturnValue(admin)
    mocks.withApiMiddleware.mockResolvedValue({
      ok: true,
      supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, rpc: mocks.rpc },
    })
  })

  it('reads state as the authenticated identity and uses service role only for the protected update', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_own_profile')
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    expect(mocks.getAdminClientWithAudit).toHaveBeenCalledWith('update welcome email sent flag')
    expect(mocks.update).toHaveBeenCalledWith({ welcome_email_sent_at: expect.any(String) })
  })

  it('does not construct a service client when the welcome email was already sent', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ welcome_email_sent_at: '2026-01-01' }], error: null })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.resendSend).not.toHaveBeenCalled()
    expect(mocks.getAdminClientWithAudit).not.toHaveBeenCalled()
  })

  it('rejects a caller-supplied email that differs from the authenticated identity', async () => {
    const response = await POST(request('other@example.test'))

    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.getAdminClientWithAudit).not.toHaveBeenCalled()
  })

  it('does not mark the email sent when delivery fails', async () => {
    mocks.resendSend.mockResolvedValueOnce({ data: null, error: new Error('delivery failed') })

    const response = await POST(request())

    expect(response.status).toBe(500)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
