import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'

const TEST_SEGMENT = 'test-segment-123'

const { reportError } = vi.hoisted(() => ({
  reportError: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  reportError,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      setSession: vi.fn(async () => ({ error: null })),
    },
  })),
}))

import { POST } from '@/app/api/test/[segment]/auth/route'

const ORIGINAL_ENV = process.env

function createRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/api/test/${TEST_SEGMENT}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function createParams(segment: string = TEST_SEGMENT) {
  return { params: Promise.resolve({ segment }) }
}

describe('/api/test/[segment]/auth', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetAllMocks()
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('returns 404 when segment does not match', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = 'correct-segment'

    const response = await POST(createRequest({ api_key: 'key', user_id: 'u1', email: 'test@example.com' }), createParams('wrong-segment'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  test('returns 404 when ENABLE_TEST_AUTH_ENDPOINT is not set', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    delete process.env.ENABLE_TEST_AUTH_ENDPOINT

    const response = await POST(createRequest({ api_key: 'key', user_id: 'u1', email: 'test@example.com' }), createParams())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  test('returns 404 when ENABLE_TEST_AUTH_ENDPOINT is false', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'false'

    const response = await POST(createRequest({ api_key: 'key', user_id: 'u1', email: 'test@example.com' }), createParams())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  test('returns 403 when internal test key is missing', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'

    const response = await POST(createRequest({ api_key: 'key', user_id: 'u1', email: 'test@example.com' }), createParams())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  test('returns 403 when internal test key is wrong', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'

    const response = await POST(
      createRequest({ api_key: 'key', user_id: 'u1', email: 'test@example.com' }, { 'x-internal-test-key': 'wrong-key' }),
      createParams(),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  test('returns 400 when body is not valid JSON', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'

    const request = new NextRequest(`http://localhost:3000/api/test/${TEST_SEGMENT}/auth`, {
      method: 'POST',
      headers: {
        'x-internal-test-key': 'secret-internal-key',
      },
      body: 'not-json',
    })

    const response = await POST(request, createParams())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' })
  })

  test('returns 400 when api_key is missing', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'

    const response = await POST(
      createRequest({ user_id: 'u1', email: 'test@example.com' }, { 'x-internal-test-key': 'secret-internal-key' }),
      createParams(),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing api_key and test identity' })
  })

  test('returns 400 when both user_id and email are missing', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'

    const response = await POST(
      createRequest({ api_key: 'test-key' }, { 'x-internal-test-key': 'secret-internal-key' }),
      createParams(),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing api_key and test identity' })
  })

  test('returns 404 when x-test-auth header is not set', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'
    process.env.TEST_API_KEY = 'test-api-key'
    process.env.TEST_USER_PASSWORD = 'test-password'

    const response = await POST(
      createRequest({ api_key: 'test-api-key', user_id: 'u1', email: 'test@example.com' }, { 'x-internal-test-key': 'secret-internal-key' }),
      createParams(),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })

  test('returns 500 when TEST_API_KEY is not configured', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'
    process.env.TEST_USER_PASSWORD = 'test-password'

    const response = await POST(
      createRequest({ api_key: 'test-api-key', user_id: 'u1', email: 'test@example.com' }, {
        'x-internal-test-key': 'secret-internal-key',
        'x-test-auth': '1',
      }),
      createParams(),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Test auth not configured on server' })
  })

  test('returns 500 when TEST_USER_PASSWORD is not configured', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'
    process.env.TEST_API_KEY = 'test-api-key'

    const response = await POST(
      createRequest({ api_key: 'test-api-key', user_id: 'u1', email: 'test@example.com' }, {
        'x-internal-test-key': 'secret-internal-key',
        'x-test-auth': '1',
      }),
      createParams(),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'TEST_USER_PASSWORD is required on server' })
  })

  test('returns 401 when api_key is invalid', async () => {
    process.env.TEST_AUTH_PATH_SEGMENT = TEST_SEGMENT
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.INTERNAL_TEST_KEY = 'secret-internal-key'
    process.env.TEST_API_KEY = 'test-api-key'
    process.env.TEST_USER_PASSWORD = 'test-password'

    const response = await POST(
      createRequest({ api_key: 'wrong-key', user_id: 'u1', email: 'test@example.com' }, {
        'x-internal-test-key': 'secret-internal-key',
        'x-test-auth': '1',
      }),
      createParams(),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid API key' })
  })
})
