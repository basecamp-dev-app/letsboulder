import { test, expect } from '@playwright/test'

test.describe('Settings (Authenticated)', () => {
  test('@full authenticated user can access settings page', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 })
  })

  test('@full profile form fields render for authenticated user', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByLabel('First Name')).toBeVisible()
    await expect(page.getByLabel('Last Name')).toBeVisible()
    await expect(page.getByLabel('Bio')).toBeVisible()
  })

  test('@full settings tabs expose tab semantics and keyboard navigation', async ({ page }) => {
    await page.goto('/settings')

    await expect(page).not.toHaveURL(/\/auth/)

    const tablist = page.getByRole('tablist', { name: /settings sections/i })
    await expect(tablist).toBeVisible()

    const profileTab = page.getByRole('tab', { name: 'Profile' })
    const unitsTab = page.getByRole('tab', { name: 'Units' })

    await expect(profileTab).toHaveAttribute('aria-selected', 'true')
    await profileTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(unitsTab).toBeFocused()
    await expect(unitsTab).toHaveAttribute('aria-selected', 'true')
  })
})
