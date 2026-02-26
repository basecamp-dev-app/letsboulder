import { test, expect } from '@playwright/test'

test.describe('Route Submission', () => {
  test('unauthenticated user is redirected to /auth when accessing /submit', async ({ page }) => {
    await page.goto('/submit')
    await expect(page).toHaveURL(/\/auth/)
  })
})
