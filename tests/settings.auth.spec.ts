import { test, expect } from '@playwright/test'

test.describe('Settings (Authenticated)', () => {
  test('authenticated user can access settings page', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
  })

  test('profile form fields render for authenticated user', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByLabel('First Name')).toBeVisible()
    await expect(page.getByLabel('Last Name')).toBeVisible()
    await expect(page.getByLabel('Bio')).toBeVisible()
  })
})
