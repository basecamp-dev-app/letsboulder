import { test, expect } from '@playwright/test'

test.describe('Logbook', () => {
  test('@full unauthenticated user sees login prompt', async ({ page }) => {
    await page.goto('/logbook')

    await expect(page).toHaveURL(/\/auth\?redirect_to=(%2Flogbook|\/logbook)/)
    await expect(page.getByText('Welcome to letsboulder')).toBeVisible()
  })

  test('@full logbook page renders correctly for unauthenticated user', async ({ page }) => {
    await page.goto('/logbook')

    await expect(page).toHaveURL(/\/auth\?redirect_to=(%2Flogbook|\/logbook)/)
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })
})
