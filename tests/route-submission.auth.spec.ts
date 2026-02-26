import { test, expect } from '@playwright/test'

test.describe('Route Submission (Authenticated)', () => {
  test('authenticated user can access /submit page', async ({ page }) => {
    await page.goto('/submit')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByText('Upload Route Photo')).toBeVisible({ timeout: 10000 })
  })

  test('submit page heading renders for authenticated user', async ({ page }) => {
    await page.goto('/submit')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('heading', { name: /upload|route/i })).toBeVisible({ timeout: 10000 })
  })
})
