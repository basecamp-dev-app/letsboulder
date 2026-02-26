import { test, expect } from '@playwright/test'

test.describe('Auth Guards', () => {
  test('unauthenticated context is redirected from /submit to auth', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()

    await page.goto('/submit')

    await expect(page).toHaveURL(/\/auth\?redirect_to=(%2Fsubmit|\/submit)/)

    await context.close()
  })

  test('unauthenticated request to /api/routes/submit is rejected', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })

    const response = await context.request.post('/api/routes/submit', {
      data: {
        name: 'No Auth Route',
        grade: '6A',
        imageUrl: 'https://example.com/image.jpg',
        latitude: 49.2,
        longitude: -2.1,
        cragsId: '00000000-0000-0000-0000-000000000000',
      },
    })

    expect([401, 403]).toContain(response.status())

    await context.close()
  })
})
