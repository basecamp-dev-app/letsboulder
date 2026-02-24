import { test, expect } from '@playwright/test'

test.describe('Route Submission', () => {
  test('unauthenticated user is redirected to /auth when accessing /submit', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page).toHaveURL(/\/auth/)
  })

  test('authenticated user can access /submit page', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page.getByText('Upload Route Photo')).toBeVisible({ timeout: 10000 })
  })

  test('submit page loads correctly', async ({ page }) => {
    await page.goto('/submit')
    
    await expect(page.getByRole('heading', { name: /upload|route/i })).toBeVisible({ timeout: 10000 })
  })
})
