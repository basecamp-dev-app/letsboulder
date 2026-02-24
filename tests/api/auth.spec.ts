import { test, expect } from '@playwright/test'

test.describe('API - Auth', () => {
  test('PUT /api/profile without auth returns 403 (CSRF)', async ({ request }) => {
    const response = await request.put('/api/profile', {
      data: {
        username: 'testuser',
        display_name: 'Test User',
      },
    })

    expect(response.status()).toBe(403)
  })

  test('GET /api/profile without auth returns 401', async ({ request }) => {
    const response = await request.get('/api/profile')

    expect(response.status()).toBe(401)
  })
})
