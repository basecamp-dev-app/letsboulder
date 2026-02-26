import { test, expect } from '@playwright/test'

test.describe('Settings', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).toHaveURL(/auth/)
  })
})
