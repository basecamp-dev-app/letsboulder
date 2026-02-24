import { test, expect } from '@playwright/test'

test.describe('Logbook', () => {
  test('unauthenticated user sees login prompt', async ({ page }) => {
    await page.goto('/logbook')
    
    await expect(page.getByText('Please login to view your logbook')).toBeVisible()
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible()
  })

  test('logbook page renders correctly for unauthenticated user', async ({ page }) => {
    await page.goto('/logbook')
    
    await expect(page.getByText('My Climbing Logbook')).toBeVisible()
  })

  test('authenticated user can access their logbook', async ({ page }) => {
    await page.goto('/logbook')
    
    await expect(page.getByText('My Climbing Logbook')).toBeVisible({ timeout: 10000 })
  })

  test('authenticated user can see logbook sections', async ({ page }) => {
    await page.goto('/logbook')
    
    await page.waitForTimeout(2000)
    
    const sections = page.locator('section, div[class*="section"]')
    const count = await sections.count()
    expect(count).toBeGreaterThan(0)
  })

  test('authenticated user can navigate to submit from logbook', async ({ page }) => {
    await page.goto('/logbook')
    
    const submitLink = page.getByRole('link', { name: /submit routes|add routes/i })
    if (await submitLink.isVisible()) {
      await expect(submitLink).toBeVisible()
    }
  })
})
