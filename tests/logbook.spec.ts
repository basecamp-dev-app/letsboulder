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
})
