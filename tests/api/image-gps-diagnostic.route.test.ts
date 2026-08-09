import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

import { POST } from '@/app/api/diagnostics/image-gps/route'
import { withApiMiddleware } from '@/lib/csrf-server'

const middleware = vi.mocked(withApiMiddleware)

const validDiagnostic = {
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1200,
  width: 2400,
  height: 3200,
  userAgent: 'Android Chrome',
  arrayBuffer: { success: true, byteLength: 1200 },
  stages: [{ name: 'exifr.gps(buffer)', durationMs: 3.2, outcome: 'empty' as const }],
  source: 'none' as const,
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://letsboulder.com/api/diagnostics/image-gps', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/diagnostics/image-gps', () => {
  beforeEach(() => {
    process.env.DEBUG_IMAGE_GPS_REPORTING = 'true'
    middleware.mockResolvedValue({ ok: true, supabase: {} as never, userId: 'user-1' } as never)
  })

  afterEach(() => {
    delete process.env.DEBUG_IMAGE_GPS_REPORTING
    vi.restoreAllMocks()
  })

  test('accepts a privacy-safe diagnostic and logs it', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const response = await POST(request(validDiagnostic))

    expect(response.status).toBe(200)
    expect(info).toHaveBeenCalledWith('[image-gps-diagnostic]', JSON.stringify(validDiagnostic))
  })

  test('rejects coordinates and other unknown fields', async () => {
    const response = await POST(request({ ...validDiagnostic, latitude: 50.8 }))

    expect(response.status).toBe(400)
  })

  test('requires middleware authentication', async () => {
    middleware.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })

    const response = await POST(request(validDiagnostic))

    expect(response.status).toBe(401)
  })

  test('is disabled unless explicitly enabled on the server', async () => {
    delete process.env.DEBUG_IMAGE_GPS_REPORTING

    const response = await POST(request(validDiagnostic))

    expect(response.status).toBe(404)
    expect(middleware).not.toHaveBeenCalled()
  })
})
