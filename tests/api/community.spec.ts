import { test, expect } from '@playwright/test'

test.describe('API - Community Posts', () => {
  test('POST /api/community/posts without auth returns 403 (CSRF)', async ({ request }) => {
    const response = await request.post('/api/community/posts', {
      data: {
        place_id: 'some-place-id',
        body: 'Test post',
        type: 'update',
      },
    })

    expect(response.status()).toBe(403)
  })

  test('POST /api/community/posts with missing place_id returns 403 (CSRF)', async ({ request }) => {
    const response = await request.post('/api/community/posts', {
      data: {
        body: 'Test post',
        type: 'update',
      },
    })

    expect(response.status()).toBe(403)
  })

  test('POST /api/community/posts with invalid place_id returns 403 (CSRF)', async ({ request }) => {
    const response = await request.post('/api/community/posts', {
      data: {
        place_id: '00000000-0000-0000-0000-000000000000',
        body: 'Test post',
        type: 'update',
      },
    })

    expect(response.status()).toBe(403)
  })
})
