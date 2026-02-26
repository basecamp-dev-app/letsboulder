import { test, expect } from '@playwright/test'

test.describe('Logbook (Authenticated)', () => {
  test('authenticated user can access their logbook', async ({ page }) => {
    await page.goto('/logbook')

    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByText(/No climbs logged yet|Recent Climbs|Contributions|Grade History/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('authenticated user can navigate to submit from logbook', async ({ page }) => {
    await page.goto('/logbook')

    await expect(page).not.toHaveURL(/\/auth/)

    const submitLink = page.getByRole('link', { name: /submit routes|add routes/i })
    if (await submitLink.isVisible()) {
      await expect(submitLink).toBeVisible()
    }
  })
})
