import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  notifyFeedback: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { POST } from '@/app/api/feedback/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { notifyFeedback } from '@/lib/discord'

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns middleware rejection response', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 }),
    } as Awaited<ReturnType<typeof withApiMiddleware>>)

    const response = await POST(new NextRequest('http://localhost:3000/api/feedback', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toContain('CSRF')
    expect(notifyFeedback).not.toHaveBeenCalled()
  })

  test('returns 400 when message is missing', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {} as never,
      userId: null,
    } as Awaited<ReturnType<typeof withApiMiddleware>>)

    const response = await POST(new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({ url: 'https://letsboulder.com/test' }),
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Message required')
    expect(notifyFeedback).not.toHaveBeenCalled()
  })

  test('sends sanitized feedback payload', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {} as never,
      userId: null,
    } as Awaited<ReturnType<typeof withApiMiddleware>>)

    const response = await POST(new NextRequest('http://localhost:3000/api/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
      },
      body: JSON.stringify({
        message: 'x'.repeat(2100),
        url: `https://letsboulder.com/${'y'.repeat(600)}`,
      }),
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(notifyFeedback).toHaveBeenCalledWith(
      'x'.repeat(2000),
      undefined,
      `https://letsboulder.com/${'y'.repeat(476)}`,
      undefined,
      undefined
    )
  })
})
